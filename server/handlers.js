import { createRoom, getRoomByCode, addPlayer, removePlayer, setPlayerTeam, startGame, nextTurn, addScore } from './state.js';
import { canStartGame, processGuess, processSkip, checkWin } from './rules.js';
import { loadCategories, createWordPool } from './words.js';

const roomTimers = new Map();   // code -> intervalId
const roomWordPools = new Map(); // code -> wordPool
const playerRooms = new Map();   // socketId -> roomCode

export function registerHandlers(io, socket) {
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

  socket.on('join-room', ({ code, playerName }) => {
    const room = getRoomByCode(code);
    if (!room) return socket.emit('error', { message: 'Room not found' });

    // Check if this is a reconnection (same name already exists)
    const existingPlayer = room.players.find(p => p.name === playerName);
    if (existingPlayer) {
      const oldId = existingPlayer.id;
      existingPlayer.id = socket.id;
      playerRooms.set(socket.id, code);
      socket.join(code);

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
        socket.emit('game-started', room.currentTurn);
        // If this player is the explainer, send a new word
        if (room.currentTurn.explainerId === socket.id) {
          const pool = roomWordPools.get(code);
          if (pool) socket.emit('new-word', { word: pool.nextWord() });
        }
      }
      return;
    }

    try {
      addPlayer(code, { id: socket.id, name: playerName });
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
    if (room.hostId !== socket.id) return;
    if (!canStartGame(room)) return socket.emit('error', { message: 'Need 2+2 teams' });

    const turnInfo = startGame(code);
    io.to(code).emit('game-started', turnInfo);
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

  socket.on('disconnect', () => {
    const code = playerRooms.get(socket.id);
    if (!code) return;
    playerRooms.delete(socket.id);
    removePlayer(code, socket.id);
    emitLobbyState(code);
  });

  function sendWord(code, explainerId) {
    const pool = roomWordPools.get(code);
    const word = pool.nextWord();
    io.to(explainerId).emit('new-word', { word });
  }

  function startTimer(io, code) {
    const room = getRoomByCode(code);
    let seconds = room.settings.roundTime;
    const interval = setInterval(() => {
      seconds--;
      io.to(code).emit('tick', { secondsLeft: seconds });
      if (seconds <= 0) {
        clearInterval(interval);
        roomTimers.delete(code);
        const current = getRoomByCode(code);
        io.to(code).emit('turn-end', {
          scores: current.scores
        });
        const turnInfo = nextTurn(code);
        io.to(code).emit('game-started', turnInfo);
        sendWord(code, turnInfo.explainerId);
        startTimer(io, code);
      }
    }, 1000);
    roomTimers.set(code, interval);
  }

  function endGame(io, code, winner) {
    const interval = roomTimers.get(code);
    if (interval) clearInterval(interval);
    roomTimers.delete(code);
    const room = getRoomByCode(code);
    room.phase = 'finished';
    io.to(code).emit('game-over', {
      winner,
      scores: room.scores
    });
  }
}
