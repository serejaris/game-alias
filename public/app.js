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

const SWIPE_TRIGGER_PX = 80;
const SWIPE_MAX_ROTATION = 15;
const SWIPE_EXIT_MS = 300;
const SWIPE_ENTER_MS = 350;

let pauseCountdownInterval = null;
const swipeState = {
  initialized: false,
  area: null,
  card: null,
  hintLeft: null,
  hintRight: null,
  isDragging: false,
  isAnimating: false,
  startX: 0,
  deltaX: 0
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

socket.on('player-joined', ({ players, hostId }) => {
  state.isHost = hostId === state.myId;

  // If we just joined and weren't on lobby yet, switch to lobby
  if (!document.getElementById('lobby').classList.contains('active') &&
      document.getElementById('home').classList.contains('active')) {
    showScreen('lobby');
    if (state.roomCode) {
      document.getElementById('room-code-display').textContent = state.roomCode;
    }
  }

  updatePlayerList(players, hostId);
});

function updatePlayerList(players, hostId) {
  const team1 = document.getElementById('team-1-players');
  const team2 = document.getElementById('team-2-players');
  const unassigned = document.getElementById('unassigned-list');
  team1.innerHTML = '';
  team2.innerHTML = '';
  unassigned.innerHTML = '';

  players.forEach(p => {
    const tag = document.createElement('div');
    tag.className = 'player-tag';
    const name = document.createElement('span');
    name.textContent = `${p.name}${p.id === state.myId ? ' (Вы)' : ''}`;
    tag.appendChild(name);

    if (p.id === hostId) {
      const hostBadge = document.createElement('span');
      hostBadge.className = 'host-badge';
      hostBadge.textContent = 'Хост';
      tag.appendChild(hostBadge);
    }

    if (state.isHost) {
      // Host can click to cycle team: unassigned -> 1 -> 2 -> 1 ...
      tag.style.cursor = 'pointer';
      tag.onclick = () => {
        const nextTeam = !p.team ? 1 : p.team === 1 ? 2 : 1;
        socket.emit('switch-team', { playerId: p.id, team: nextTeam });
      };
    } else {
      tag.style.cursor = 'default';
    }

    if (p.team === 1) team1.appendChild(tag);
    else if (p.team === 2) team2.appendChild(tag);
    else unassigned.appendChild(tag);
  });

  // Start button: host sees it always, enabled only for exact 2v2
  const startBtn = document.getElementById('btn-start');
  const t1count = players.filter(p => p.team === 1).length;
  const t2count = players.filter(p => p.team === 2).length;
  const ready = players.length === 4 && t1count === 2 && t2count === 2;

  if (state.isHost) {
    startBtn.classList.remove('hidden');
    startBtn.disabled = !ready;
    startBtn.textContent = ready ? 'Начать игру' : `Начать игру (${t1count}/2 vs ${t2count}/2)`;
  } else {
    startBtn.classList.add('hidden');
    startBtn.disabled = true;
    startBtn.textContent = 'Начать игру';
  }

  // Lobby status
  const statusEl = document.getElementById('lobby-status');
  if (statusEl) {
    const total = players.length;
    if (total < 4) {
      statusEl.textContent = `Ожидание игроков (${total}/4)`;
    } else {
      if (t1count === 2 && t2count === 2) {
        statusEl.textContent = 'Все готовы!';
      } else {
        statusEl.textContent = 'Распределите по командам 2+2';
      }
    }
  }
}

// Start game (host)
document.getElementById('btn-start').onclick = () => {
  socket.emit('start-game');
};

// Game started — determine role
socket.on('game-started', ({ team, explainerId, guesserId }) => {
  const myId = socket.id || state.myId;
  state.myId = myId;
  console.log('game-started', { myId, explainerId, guesserId });

  showScreen('game');
  stopPauseCountdown();
  resetSwipeCard();

  // Hide all role views first
  document.getElementById('explainer-view').classList.add('hidden');
  document.getElementById('guesser-view').classList.add('hidden');
  document.getElementById('observer-view').classList.add('hidden');
  document.getElementById('turn-overlay').classList.add('hidden');

  if (myId === explainerId) {
    state.role = 'explainer';
    document.getElementById('explainer-view').classList.remove('hidden');
  } else if (myId === guesserId) {
    state.role = 'guesser';
    document.getElementById('guesser-view').classList.remove('hidden');
    initSwipeCard();
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
  const timerProgress = document.querySelector('.timer-progress');
  const timerContainer = document.querySelector('.timer-container');
  timerProgress.style.strokeDashoffset = circumference - progress;

  timerProgress.classList.remove('warning', 'danger');
  timerContainer.classList.remove('pulse');

  if (secondsLeft <= 5) {
    timerProgress.classList.add('danger');
    timerContainer.classList.add('pulse');
    navigator.vibrate?.(30);
  } else if (secondsLeft <= 15) {
    timerProgress.classList.add('warning');
  }
});

// Turn end
socket.on('turn-end', ({ scores, pauseDuration = 5 }) => {
  updateScores(scores);

  const overlay = document.getElementById('turn-overlay');
  overlay.classList.remove('hidden');
  const overlayT1 = overlay.querySelector('.team-1-score');
  const overlayT2 = overlay.querySelector('.team-2-score');
  if (overlayT1) overlayT1.textContent = scores[1];
  if (overlayT2) overlayT2.textContent = scores[2];
  startPauseCountdown(pauseDuration);
});

// Game over
socket.on('game-over', ({ winner, scores }) => {
  stopPauseCountdown();
  document.getElementById('turn-overlay').classList.add('hidden');
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
  stopPauseCountdown();
  document.getElementById('turn-overlay').classList.add('hidden');
  sessionStorage.removeItem('alias-session');
  state = { myId: socket.id, myName: null, roomCode: null, isHost: false, role: null, roundTime: 60 };
  showScreen('home');
};

// ========== GAME ACTIONS ==========
document.getElementById('btn-guess').onclick = () => {
  if (state.role !== 'guesser') return;
  socket.emit('guess');
  navigator.vibrate?.(50);
};
document.getElementById('btn-skip').onclick = () => {
  if (state.role !== 'guesser') return;
  socket.emit('skip');
  navigator.vibrate?.(30);
};

// ========== COPY ROOM CODE ==========
document.getElementById('btn-copy-code')?.addEventListener('click', () => {
  const code = document.getElementById('room-code-display').textContent;
  navigator.clipboard?.writeText(code).then(() => showToast('Код скопирован!'));
});

// ========== HELPERS ==========
function stopPauseCountdown() {
  if (pauseCountdownInterval) {
    clearInterval(pauseCountdownInterval);
    pauseCountdownInterval = null;
  }
}

function startPauseCountdown(pauseDuration = 5) {
  stopPauseCountdown();
  const secondsEl = document.getElementById('pause-seconds');
  if (!secondsEl) return;

  let secondsLeft = Number.isFinite(pauseDuration) ? pauseDuration : 5;
  secondsEl.textContent = String(secondsLeft);

  pauseCountdownInterval = setInterval(() => {
    secondsLeft -= 1;
    if (secondsLeft <= 0) {
      secondsEl.textContent = '0';
      stopPauseCountdown();
      return;
    }
    secondsEl.textContent = String(secondsLeft);
  }, 1000);
}

function initSwipeCard() {
  swipeState.area = document.getElementById('swipe-area');
  swipeState.card = document.getElementById('swipe-card');
  swipeState.hintLeft = document.getElementById('swipe-hint-left');
  swipeState.hintRight = document.getElementById('swipe-hint-right');
  if (!swipeState.area || !swipeState.card) return;

  resetSwipeCard();

  if (swipeState.initialized) return;
  swipeState.initialized = true;

  swipeState.area.addEventListener('touchstart', onSwipeTouchStart, { passive: true });
  swipeState.area.addEventListener('touchmove', onSwipeTouchMove, { passive: false });
  swipeState.area.addEventListener('touchend', onSwipeTouchEnd);
  swipeState.area.addEventListener('touchcancel', onSwipeTouchEnd);
  swipeState.area.addEventListener('mousedown', onSwipeMouseDown);
  window.addEventListener('mousemove', onSwipeMouseMove);
  window.addEventListener('mouseup', onSwipeMouseUp);
}

function onSwipeTouchStart(event) {
  const touch = event.touches[0];
  if (!touch) return;
  startSwipe(touch.clientX);
}

function onSwipeTouchMove(event) {
  if (!swipeState.isDragging) return;
  const touch = event.touches[0];
  if (!touch) return;
  event.preventDefault();
  moveSwipe(touch.clientX);
}

function onSwipeTouchEnd() {
  endSwipe();
}

function onSwipeMouseDown(event) {
  if (event.button !== 0) return;
  startSwipe(event.clientX);
}

function onSwipeMouseMove(event) {
  if (!swipeState.isDragging) return;
  moveSwipe(event.clientX);
}

function onSwipeMouseUp() {
  endSwipe();
}

function startSwipe(clientX) {
  if (state.role !== 'guesser' || swipeState.isAnimating || !swipeState.card) return;
  swipeState.isDragging = true;
  swipeState.startX = clientX;
  swipeState.deltaX = 0;
  swipeState.card.style.transition = 'none';
  swipeState.card.classList.remove('entering', 'exit-left', 'exit-right');
  applySwipeTransform(0);
}

function moveSwipe(clientX) {
  if (!swipeState.isDragging) return;
  swipeState.deltaX = clientX - swipeState.startX;
  applySwipeTransform(swipeState.deltaX);
}

function endSwipe() {
  if (!swipeState.isDragging) return;
  swipeState.isDragging = false;

  if (Math.abs(swipeState.deltaX) >= SWIPE_TRIGGER_PX) {
    triggerSwipe(swipeState.deltaX > 0 ? 'right' : 'left');
    return;
  }
  snapSwipeBack();
}

function applySwipeTransform(deltaX) {
  if (!swipeState.card) return;
  const limited = Math.max(-160, Math.min(160, deltaX));
  const rotation = Math.max(-SWIPE_MAX_ROTATION, Math.min(SWIPE_MAX_ROTATION, limited * 0.1));
  swipeState.card.style.transform = `translateX(${limited}px) rotate(${rotation}deg)`;

  swipeState.card.classList.toggle('swiping-left', limited < -20);
  swipeState.card.classList.toggle('swiping-right', limited > 20);

  const strength = Math.min(1, Math.abs(limited) / SWIPE_TRIGGER_PX);
  if (swipeState.hintLeft) swipeState.hintLeft.style.opacity = limited < 0 ? String(strength) : '0';
  if (swipeState.hintRight) swipeState.hintRight.style.opacity = limited > 0 ? String(strength) : '0';
}

function snapSwipeBack() {
  if (!swipeState.card) return;
  swipeState.card.style.transition = 'transform 180ms ease';
  swipeState.card.style.transform = 'translateX(0) rotate(0deg)';
  swipeState.card.classList.remove('swiping-left', 'swiping-right');
  if (swipeState.hintLeft) swipeState.hintLeft.style.opacity = '0';
  if (swipeState.hintRight) swipeState.hintRight.style.opacity = '0';
}

function triggerSwipe(direction) {
  if (state.role !== 'guesser' || swipeState.isAnimating || !swipeState.card) return;
  swipeState.isAnimating = true;
  swipeState.isDragging = false;

  if (direction === 'right') {
    socket.emit('guess');
    navigator.vibrate?.(50);
  } else {
    socket.emit('skip');
    navigator.vibrate?.(30);
  }

  swipeState.card.classList.remove('swiping-left', 'swiping-right', 'entering');
  swipeState.card.classList.add(direction === 'right' ? 'exit-right' : 'exit-left');
  if (swipeState.hintLeft) swipeState.hintLeft.style.opacity = direction === 'left' ? '1' : '0';
  if (swipeState.hintRight) swipeState.hintRight.style.opacity = direction === 'right' ? '1' : '0';

  setTimeout(() => {
    if (!swipeState.card) {
      swipeState.isAnimating = false;
      return;
    }
    swipeState.card.classList.remove('exit-left', 'exit-right');
    swipeState.card.style.transform = 'translateX(0) rotate(0deg)';
    void swipeState.card.offsetWidth;
    swipeState.card.classList.add('entering');
    if (swipeState.hintLeft) swipeState.hintLeft.style.opacity = '0';
    if (swipeState.hintRight) swipeState.hintRight.style.opacity = '0';

    setTimeout(() => {
      if (!swipeState.card) {
        swipeState.isAnimating = false;
        return;
      }
      swipeState.card.classList.remove('entering', 'swiping-left', 'swiping-right');
      swipeState.card.style.transition = '';
      swipeState.isAnimating = false;
    }, SWIPE_ENTER_MS);
  }, SWIPE_EXIT_MS);
}

function resetSwipeCard() {
  if (!swipeState.card) return;
  swipeState.isDragging = false;
  swipeState.isAnimating = false;
  swipeState.deltaX = 0;
  swipeState.card.style.transition = 'none';
  swipeState.card.style.transform = 'translateX(0) rotate(0deg)';
  swipeState.card.classList.remove('swiping-left', 'swiping-right', 'exit-left', 'exit-right', 'entering');
  if (swipeState.hintLeft) swipeState.hintLeft.style.opacity = '0';
  if (swipeState.hintRight) swipeState.hintRight.style.opacity = '0';
  requestAnimationFrame(() => {
    if (swipeState.card) swipeState.card.style.transition = '';
  });
}

function updateScores(scores) {
  document.querySelectorAll('.team-1-score').forEach(el => {
    if (el.textContent !== String(scores[1])) {
      el.textContent = scores[1];
      el.classList.remove('score-bump');
      void el.offsetWidth;
      el.classList.add('score-bump');
    }
  });
  document.querySelectorAll('.team-2-score').forEach(el => {
    if (el.textContent !== String(scores[2])) {
      el.textContent = scores[2];
      el.classList.remove('score-bump');
      void el.offsetWidth;
      el.classList.add('score-bump');
    }
  });
}

function showToast(message) {
  const toast = document.getElementById('error-toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}
