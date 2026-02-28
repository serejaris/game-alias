export function canStartGame(room) {
  if (room.players.length !== 4) return false;
  const team1 = room.players.filter(p => p.team === 1).length;
  const team2 = room.players.filter(p => p.team === 2).length;
  return team1 === 2 && team2 === 2;
}

export function processGuess() {
  return { delta: 1, result: 'guessed' };
}

export function processSkip() {
  return { delta: -1, result: 'skipped' };
}

export function checkWin(scores, targetScore) {
  if (scores[1] >= targetScore) return 1;
  if (scores[2] >= targetScore) return 2;
  return null;
}
