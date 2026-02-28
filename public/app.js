const socket = io();

// State
let state = {
  myId: null,
  myName: null,
  roomCode: null,
  isHost: false,
  role: null, // 'explainer' | 'guesser' | 'observer'
  roundTime: 60
};

// Reconnection support
socket.on('connect', () => {
  state.myId = socket.id;

  // Try to rejoin if we have saved session
  const saved = sessionStorage.getItem('alias-session');
  if (saved) {
    const { roomCode, myName } = JSON.parse(saved);
    if (roomCode && myName) {
      state.roomCode = roomCode;
      state.myName = myName;
      socket.emit('join-room', { code: roomCode, playerName: myName });
    }
  }
});

// ========== SCREEN MANAGEMENT ==========
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(name).classList.add('active');
}

// ========== HOME SCREEN ==========
document.getElementById('btn-create').onclick = () => showScreen('create');

document.getElementById('btn-join').onclick = () => {
  document.getElementById('join-form').classList.toggle('hidden');
};

document.getElementById('btn-join-submit').onclick = () => {
  const code = document.getElementById('input-code').value.trim();
  const name = document.getElementById('input-name-join').value.trim();
  if (!code || !name) return;
  state.myName = name;
  state.roomCode = code;
  socket.emit('join-room', { code, playerName: name });
  sessionStorage.setItem('alias-session', JSON.stringify({ roomCode: code, myName: name }));
};

// ========== CREATE SCREEN ==========
// Load categories — socket.io queues this until connected
socket.emit('get-categories', (categories) => {
  const container = document.getElementById('categories-list');
  categories.forEach(cat => {
    const chip = document.createElement('button');
    chip.className = 'category-chip selected';
    chip.textContent = cat;
    chip.onclick = () => chip.classList.toggle('selected');
    container.appendChild(chip);
  });
});

// Radio button groups
document.querySelectorAll('.radio-group').forEach(group => {
  group.querySelectorAll('.radio-btn').forEach(btn => {
    btn.onclick = () => {
      group.querySelectorAll('.radio-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    };
  });
});

document.getElementById('btn-create-room').onclick = () => {
  const name = document.getElementById('input-name-create').value.trim();
  if (!name) return;
  state.myName = name;
  state.isHost = true;

  const categories = [...document.querySelectorAll('#categories-list .category-chip.selected')]
    .map(chip => chip.textContent);
  const targetScore = parseInt(document.querySelector('#target-score-group .selected').dataset.value);
  const roundTime = parseInt(document.querySelector('#round-time-group .selected').dataset.value);
  state.roundTime = roundTime;

  socket.emit('create-room', { categories, targetScore, roundTime });
};

// ========== SOCKET LISTENERS ==========

socket.on('room-created', ({ code }) => {
  state.roomCode = code;
  document.getElementById('room-code-display').textContent = code;
  showScreen('lobby');
  // Host auto-joins as player
  socket.emit('join-room', { code, playerName: state.myName });
  sessionStorage.setItem('alias-session', JSON.stringify({ roomCode: code, myName: state.myName }));
});

socket.on('player-joined', ({ players }) => {
  // If we just joined and weren't on lobby yet, switch to lobby
  if (!document.getElementById('lobby').classList.contains('active') &&
      document.getElementById('home').classList.contains('active')) {
    showScreen('lobby');
    if (!state.isHost && state.roomCode) {
      document.getElementById('room-code-display').textContent = state.roomCode;
    }
  }

  updatePlayerList(players);
});

function updatePlayerList(players) {
  const team1 = document.getElementById('team-1-players');
  const team2 = document.getElementById('team-2-players');
  const unassigned = document.getElementById('unassigned-list');
  team1.innerHTML = '';
  team2.innerHTML = '';
  unassigned.innerHTML = '';

  players.forEach(p => {
    const tag = document.createElement('div');
    tag.className = 'player-tag';
    tag.innerHTML = `${p.name}${p.id === state.myId ? ' (Вы)' : ''}`;

    if (state.isHost && p.id !== state.myId) {
      // Host can click to cycle team: unassigned -> 1 -> 2 -> 1 ...
      tag.style.cursor = 'pointer';
      tag.onclick = () => {
        const nextTeam = !p.team ? 1 : p.team === 1 ? 2 : 1;
        socket.emit('switch-team', { playerId: p.id, team: nextTeam });
      };
    }

    if (p.team === 1) team1.appendChild(tag);
    else if (p.team === 2) team2.appendChild(tag);
    else unassigned.appendChild(tag);
  });

  // Show/hide start button (host only, needs 2+2)
  const startBtn = document.getElementById('btn-start');
  if (state.isHost) {
    const t1count = players.filter(p => p.team === 1).length;
    const t2count = players.filter(p => p.team === 2).length;
    if (t1count >= 2 && t2count >= 2) {
      startBtn.classList.remove('hidden');
    } else {
      startBtn.classList.add('hidden');
    }
  }
}

// Start game (host)
document.getElementById('btn-start').onclick = () => {
  socket.emit('start-game');
};

// Game started — determine role
socket.on('game-started', ({ team, explainerId, guesserId }) => {
  showScreen('game');

  // Hide all role views first
  document.getElementById('explainer-view').classList.add('hidden');
  document.getElementById('guesser-view').classList.add('hidden');
  document.getElementById('observer-view').classList.add('hidden');
  document.getElementById('turn-overlay').classList.add('hidden');

  if (socket.id === explainerId) {
    state.role = 'explainer';
    document.getElementById('explainer-view').classList.remove('hidden');
  } else if (socket.id === guesserId) {
    state.role = 'guesser';
    document.getElementById('guesser-view').classList.remove('hidden');
  } else {
    state.role = 'observer';
    document.getElementById('observer-view').classList.remove('hidden');
    document.getElementById('playing-team').textContent = team;
  }
});

// Word for explainer
socket.on('new-word', ({ word }) => {
  document.getElementById('current-word').textContent = word;
});

// Word result
socket.on('word-result', ({ result, scores }) => {
  updateScores(scores);

  const flash = document.getElementById('word-result');
  flash.textContent = result === 'guessed' ? '+1' : '-1';
  flash.className = `word-result ${result}`;
  setTimeout(() => flash.classList.add('hidden'), 600);
});

// Timer tick
socket.on('tick', ({ secondsLeft }) => {
  document.getElementById('timer-text').textContent = secondsLeft;

  const circumference = 283;
  const progress = (secondsLeft / state.roundTime) * circumference;
  document.querySelector('.timer-progress').style.strokeDashoffset = circumference - progress;
});

// Turn end
socket.on('turn-end', ({ scores }) => {
  updateScores(scores);

  const overlay = document.getElementById('turn-overlay');
  overlay.classList.remove('hidden');
  const overlayT1 = overlay.querySelector('.team-1-score');
  const overlayT2 = overlay.querySelector('.team-2-score');
  if (overlayT1) overlayT1.textContent = scores[1];
  if (overlayT2) overlayT2.textContent = scores[2];
  // Overlay will be hidden when next game-started fires
});

// Game over
socket.on('game-over', ({ winner, scores }) => {
  showScreen('results');
  document.getElementById('winner-text').textContent = `Команда ${winner} победила!`;
  document.getElementById('final-score-1').textContent = scores[1];
  document.getElementById('final-score-2').textContent = scores[2];
});

// Error
socket.on('error', ({ message }) => {
  showToast(message);
});

// Connection error
socket.on('connect_error', () => {
  showToast('Connection lost. Reconnecting...');
});

// Play again
document.getElementById('btn-play-again').onclick = () => {
  sessionStorage.removeItem('alias-session');
  state = { myId: socket.id, myName: null, roomCode: null, isHost: false, role: null, roundTime: 60 };
  showScreen('home');
};

// ========== GAME ACTIONS ==========
document.getElementById('btn-guess').onclick = () => socket.emit('guess');
document.getElementById('btn-skip').onclick = () => socket.emit('skip');

// ========== HELPERS ==========
function updateScores(scores) {
  document.querySelectorAll('.team-1-score').forEach(el => el.textContent = scores[1]);
  document.querySelectorAll('.team-2-score').forEach(el => el.textContent = scores[2]);
}

function showToast(message) {
  const toast = document.getElementById('error-toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}
