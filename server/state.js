const rooms = new Map();

function generateCode() {
  let code;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms.has(code));
  return code;
}

function computeTurn(room) {
  const { turnIndex, players } = room;
  const team = (turnIndex % 2 === 0) ? 1 : 2;
  const teamPlayers = players.filter(p => p.team === team);
  const teamTurnCount = Math.floor(turnIndex / 2);
  const explainerIdx = teamTurnCount % teamPlayers.length;
  const guesserIdx = (explainerIdx + 1) % teamPlayers.length;

  return {
    team,
    explainerId: teamPlayers[explainerIdx].id,
    guesserId: teamPlayers[guesserIdx].id
  };
}

export function createRoom({ hostId, categories, targetScore, roundTime }) {
  const code = generateCode();
  rooms.set(code, {
    code,
    hostId,
    settings: { categories, targetScore, roundTime },
    players: [],
    scores: { 1: 0, 2: 0 },
    phase: 'lobby',
    currentTurn: null,
    turnIndex: 0
  });
  return code;
}

export function getRoomByCode(code) {
  return rooms.get(code);
}

export const getRoom = getRoomByCode;

export function addPlayer(code, { id, name }) {
  const room = rooms.get(code);
  if (room.players.length >= 4) {
    throw new Error('Room is full');
  }
  room.players.push({ id, name, team: null });
}

export function removePlayer(code, playerId) {
  const room = rooms.get(code);
  room.players = room.players.filter(p => p.id !== playerId);
}

export function setPlayerTeam(code, playerId, team) {
  const room = rooms.get(code);
  const player = room.players.find(p => p.id === playerId);
  player.team = team;
}

export function startGame(code) {
  const room = rooms.get(code);
  room.phase = 'playing';
  room.turnIndex = 0;
  room.currentTurn = computeTurn(room);
  return room.currentTurn;
}

export function nextTurn(code) {
  const room = rooms.get(code);
  room.turnIndex++;
  room.currentTurn = computeTurn(room);
  return room.currentTurn;
}

export function addScore(code, team, points) {
  const room = rooms.get(code);
  room.scores[team] += points;
}
