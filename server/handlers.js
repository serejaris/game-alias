import { createRoom, getRoomByCode, addPlayer, removePlayer, setPlayerTeam, startGame, nextTurn, addScore } from './state.js';
import { canStartGame, processGuess, processSkip, checkWin } from './rules.js';
import { loadCategories, createWordPool } from './words.js';

const roomTimers = new Map();   // code -> timerId (interval or timeout)
const roomWordPools = new Map(); // code -> wordPool
const playerRooms = new Map();   // socketId -> roomCode
const disconnectTimers = new Map(); // playerKey:roomCode -> { timerId, socketId }
const ROUND_PAUSE_SECONDS = 5;
const ROUND_PAUSE_MS = ROUND_PAUSE_SECONDS * 1000;
const STEAL_WINDOW_ENABLED = true;
const STEAL_WINDOW_SECONDS = 2;
const STEAL_WINDOW_MS = STEAL_WINDOW_SECONDS * 1000;
const DISCONNECT_GRACE_MS = 30_000;

export function registerHandlers(io, socket) {
  function getTurnId(room) {
    return room.turnIndex + 1;
  }

  function getRoleForPlayer(turnInfo, playerId) {
    if (playerId === turnInfo.explainerId) return 'explainer';
    if (playerId === turnInfo.guesserId) return 'guesser';
    return 'observer';
  }

  function buildGameStartedPayload(room, playerId) {
    if (!room?.currentTurn) return null;
    const player = room.players.find(p => p.id === playerId);
    return {
      ...room.currentTurn,
      roundTime: room.settings.roundTime,
      myRole: getRoleForPlayer(room.currentTurn, playerId),
      myTeam: player?.team ?? null,
      turnId: getTurnId(room)
    };
  }

  function emitGameStarted(code) {
    const room = getRoomByCode(code);
    if (!room?.currentTurn) return;
    room.players
      .filter(player => !player.disconnected)
      .forEach(player => {
        const payload = buildGameStartedPayload(room, player.id);
        if (payload) io.to(player.id).emit('game-started', payload);
      });
  }

  function getDisconnectKey(player, code) {
    return `${player.sessionId || player.name}:${code}`;
  }

  function clearRoomTimer(code) {
    const timer = roomTimers.get(code);
    if (!timer) return;
    clearTimeout(timer);
    clearInterval(timer);
    roomTimers.delete(code);
  }

  function scheduleRoundPause(code) {
    const room = getRoomByCode(code);
    if (!room || (room.phase !== 'playing' && room.phase !== 'steal_window')) return;

    room.phase = 'round_pause';
    room.stealEndsAt = null;
    room.pauseEndsAt = Date.now() + ROUND_PAUSE_MS;
    io.to(code).emit('turn-end', {
      scores: room.scores,
      pauseDuration: ROUND_PAUSE_SECONDS,
      pauseEndsAt: room.pauseEndsAt,
      turnId: getTurnId(room)
    });

    const pauseTimer = setTimeout(() => {
      const activeRoom = getRoomByCode(code);
      if (!activeRoom || activeRoom.phase !== 'round_pause') return;
      activeRoom.phase = 'playing';
      activeRoom.pauseEndsAt = null;
      const turnInfo = nextTurn(code);
      emitGameStarted(code);
      sendWord(code, turnInfo.explainerId);
      startTimer(io, code);
    }, ROUND_PAUSE_MS);

    roomTimers.set(code, pauseTimer);
  }

  function emitLobbyState(code) {
    const room = getRoomByCode(code);
    if (!room) return;
    io.to(code).emit('player-joined', {
      players: room.players,
      hostId: room.hostId
    });
  }

  socket.on('get-categories', (callback) => {
    callback(loadCategories());
  });

  socket.on('create-room', ({ categories, targetScore, roundTime }) => {
    const code = createRoom({
      hostId: socket.id,
      categories,
      targetScore,
      roundTime
    });
    roomWordPools.set(code, createWordPool(categories));
    playerRooms.set(socket.id, code);
    socket.join(code);
    socket.emit('room-created', { code });
  });

  socket.on('join-room', ({ code, playerName, playerSessionId }) => {
    const room = getRoomByCode(code);
    if (!room) return socket.emit('error', { message: 'Room not found' });

    // Reconnection priority: stable session id, then legacy name fallback.
    let existingPlayer = null;
    if (playerSessionId) {
      existingPlayer = room.players.find(p => p.sessionId && p.sessionId === playerSessionId);
      if (!existingPlayer) {
        existingPlayer = room.players.find(
          p => p.name === playerName && p.disconnected && !p.sessionId
        );
        if (existingPlayer) existingPlayer.sessionId = playerSessionId;
      }
    } else {
      existingPlayer = room.players.find(p => p.name === playerName);
    }

    if (existingPlayer) {
      const oldId = existingPlayer.id;
      existingPlayer.id = socket.id;
      existingPlayer.name = playerName;
      if (playerSessionId && !existingPlayer.sessionId) {
        existingPlayer.sessionId = playerSessionId;
      }
      existingPlayer.disconnected = false;
      playerRooms.set(socket.id, code);
      socket.join(code);

      // Cancel pending disconnect removal
      const reconnectKeys = new Set([
        getDisconnectKey(existingPlayer, code),
        `${playerName}:${code}`
      ]);
      reconnectKeys.forEach(key => {
        const pending = disconnectTimers.get(key);
        if (!pending) return;
        clearTimeout(pending.timerId);
        disconnectTimers.delete(key);
      });

      // Update host id if needed
      if (room.hostId === oldId) {
        room.hostId = socket.id;
      }

      // Update current turn references if needed
      if (room.currentTurn) {
        if (room.currentTurn.explainerId === oldId) room.currentTurn.explainerId = socket.id;
        if (room.currentTurn.guesserId === oldId) room.currentTurn.guesserId = socket.id;
      }

      emitLobbyState(code);

      // If game is in progress, resend game state
      if (room.phase === 'playing' && room.currentTurn) {
        const payload = buildGameStartedPayload(room, socket.id);
        if (payload) socket.emit('game-started', payload);
        // If this player is the explainer, send a new word
        if (room.currentTurn.explainerId === socket.id) {
          const pool = roomWordPools.get(code);
          if (pool) socket.emit('new-word', { word: pool.nextWord() });
        }
      } else if (room.phase === 'steal_window') {
        const now = Date.now();
        const remainingMs = Math.max(0, (room.stealEndsAt || now) - now);
        socket.emit('steal-window-started', {
          duration: Math.max(0, Math.ceil(remainingMs / 1000)),
          stealEndsAt: room.stealEndsAt || now,
          playingTeam: room.currentTurn?.team ?? null,
          turnId: getTurnId(room)
        });
      } else if (room.phase === 'round_pause') {
        const now = Date.now();
        const remainingMs = Math.max(0, (room.pauseEndsAt || now) - now);
        const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
        socket.emit('turn-end', {
          scores: room.scores,
          pauseDuration: remainingSeconds,
          pauseEndsAt: room.pauseEndsAt || now,
          turnId: getTurnId(room)
        });
      }
      return;
    }

    try {
      addPlayer(code, { id: socket.id, name: playerName, sessionId: playerSessionId || null });
    } catch (e) {
      return socket.emit('error', { message: e.message });
    }
    playerRooms.set(socket.id, code);
    socket.join(code);
    emitLobbyState(code);
  });

  socket.on('switch-team', ({ playerId, team }) => {
    const code = playerRooms.get(socket.id);
    const room = getRoomByCode(code);
    if (!room || room.hostId !== socket.id) return;
    setPlayerTeam(code, playerId, team);
    emitLobbyState(code);
  });

  socket.on('start-game', () => {
    const code = playerRooms.get(socket.id);
    const room = getRoomByCode(code);
    if (!room) return;
    if (room.hostId !== socket.id) return;
    if (!canStartGame(room)) return socket.emit('error', { message: 'Need 2+2 teams' });

    const turnInfo = startGame(code);
    room.pauseEndsAt = null;
    room.stealEndsAt = null;
    emitGameStarted(code);
    sendWord(code, turnInfo.explainerId);
    startTimer(io, code);
  });

  socket.on('guess', () => {
    const code = playerRooms.get(socket.id);
    const room = getRoomByCode(code);
    if (room.phase !== 'playing') return;
    if (room.currentTurn.guesserId !== socket.id) return;

    const { delta, result } = processGuess();
    addScore(code, room.currentTurn.team, delta);
    const updated = getRoomByCode(code);

    io.to(code).emit('word-result', { result, scores: updated.scores });

    const winner = checkWin(updated.scores, updated.settings.targetScore);
    if (winner) return endGame(io, code, winner);

    sendWord(code, room.currentTurn.explainerId);
  });

  socket.on('skip', () => {
    const code = playerRooms.get(socket.id);
    const room = getRoomByCode(code);
    if (room.phase !== 'playing') return;
    if (room.currentTurn.guesserId !== socket.id) return;

    const { delta, result } = processSkip();
    addScore(code, room.currentTurn.team, delta);
    const updated = getRoomByCode(code);

    io.to(code).emit('word-result', { result, scores: updated.scores });
    sendWord(code, room.currentTurn.explainerId);
  });

  socket.on('steal-word', () => {
    const code = playerRooms.get(socket.id);
    const room = getRoomByCode(code);
    if (!room || room.phase !== 'steal_window' || !room.currentTurn) return;

    const player = room.players.find(p => p.id === socket.id && !p.disconnected);
    if (!player || !player.team) return;
    if (player.team === room.currentTurn.team) return;

    clearRoomTimer(code);
    addScore(code, player.team, 1);
    const updated = getRoomByCode(code);
    io.to(code).emit('steal-word-result', { team: player.team, scores: updated.scores });

    const winner = checkWin(updated.scores, updated.settings.targetScore);
    if (winner) return endGame(io, code, winner);

    scheduleRoundPause(code);
  });

  socket.on('disconnect', () => {
    const code = playerRooms.get(socket.id);
    if (!code) return;
    const room = getRoomByCode(code);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) {
      playerRooms.delete(socket.id);
      return;
    }

    const key = getDisconnectKey(player, code);
    player.disconnected = true;
    if (room.hostId === socket.id) {
      const nextHost = room.players.find(p => !p.disconnected && p.id !== socket.id);
      room.hostId = nextHost?.id ?? null;
    }
    playerRooms.delete(socket.id);
    emitLobbyState(code);

    const timerId = setTimeout(() => {
      disconnectTimers.delete(key);
      const currentRoom = getRoomByCode(code);
      if (!currentRoom) return;
      const p = currentRoom.players.find(pl =>
        pl.disconnected &&
        ((player.sessionId && pl.sessionId === player.sessionId) || pl.name === player.name)
      );
      if (p) {
        removePlayer(code, p.id);
        emitLobbyState(code);
      }
    }, DISCONNECT_GRACE_MS);

    disconnectTimers.set(key, { timerId, socketId: socket.id });
  });

  function sendWord(code, explainerId) {
    const pool = roomWordPools.get(code);
    const word = pool.nextWord();
    io.to(explainerId).emit('new-word', { word });
  }

  function startTimer(io, code) {
    const room = getRoomByCode(code);
    if (!room || room.phase !== 'playing') return;
    let seconds = room.settings.roundTime;
    const interval = setInterval(() => {
      seconds--;
      io.to(code).emit('tick', { secondsLeft: seconds });
      if (seconds <= 0) {
        clearInterval(interval);
        if (roomTimers.get(code) === interval) {
          roomTimers.delete(code);
        }
        const current = getRoomByCode(code);
        if (!current || current.phase !== 'playing') return;

        if (STEAL_WINDOW_ENABLED) {
          current.phase = 'steal_window';
          current.stealEndsAt = Date.now() + STEAL_WINDOW_MS;
          io.to(code).emit('steal-window-started', {
            duration: STEAL_WINDOW_SECONDS,
            stealEndsAt: current.stealEndsAt,
            playingTeam: current.currentTurn?.team ?? null,
            turnId: getTurnId(current)
          });

          const stealTimer = setTimeout(() => {
            const activeRoom = getRoomByCode(code);
            if (!activeRoom || activeRoom.phase !== 'steal_window') return;
            scheduleRoundPause(code);
          }, STEAL_WINDOW_MS);
          roomTimers.set(code, stealTimer);
          return;
        }

        scheduleRoundPause(code);
      }
    }, 1000);
    roomTimers.set(code, interval);
  }

  function endGame(io, code, winner) {
    clearRoomTimer(code);
    const room = getRoomByCode(code);
    room.phase = 'finished';
    room.pauseEndsAt = null;
    room.stealEndsAt = null;
    io.to(code).emit('game-over', {
      winner,
      scores: room.scores
    });
  }
}
