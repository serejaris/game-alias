import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const DEFAULT_ROUND_TIME = 60;
const SWIPE_TRIGGER_PX = 80;
const SWIPE_CLAMP_PX = 160;
const SWIPE_MAX_ROTATION = 15;
const SWIPE_EXIT_MS = 300;
const SWIPE_ENTER_MS = 350;
const SESSION_ID_KEY = 'alias-player-session-id';
const SWIPE_HINT_KEY = 'alias-swipe-hint-seen';

const TARGET_SCORE_OPTIONS = [30, 50, 70];
const ROUND_TIME_OPTIONS = [30, 45, 60];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readSession() {
  const raw = sessionStorage.getItem('alias-session');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeSession(roomCode, myName) {
  if (!roomCode || !myName) return;
  sessionStorage.setItem('alias-session', JSON.stringify({ roomCode, myName }));
}

function clearSession() {
  sessionStorage.removeItem('alias-session');
}

function getOrCreatePlayerSessionId() {
  const existing = localStorage.getItem(SESSION_ID_KEY);
  if (existing) return existing;
  const generated = crypto?.randomUUID?.() || `alias-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(SESSION_ID_KEY, generated);
  return generated;
}

export function App() {
  const socketRef = useRef(null);
  const myIdRef = useRef('');
  const myNameRef = useRef('');
  const roomCodeRef = useRef('');
  const myTeamRef = useRef(null);
  const currentTurnIdRef = useRef(0);
  const roundTimeRef = useRef(DEFAULT_ROUND_TIME);
  const screenRef = useRef('home');

  const toastTimerRef = useRef(null);
  const wordResultTimerRef = useRef(null);
  const swipeExitTimerRef = useRef(null);
  const swipeEnterTimerRef = useRef(null);

  const swipeRef = useRef({
    dragging: false,
    startX: 0,
    deltaX: 0,
    pointerId: null,
    isAnimating: false
  });

  const [screen, setScreen] = useState('home');
  const [myId, setMyId] = useState('');
  const [myName, setMyName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [role, setRole] = useState(null);
  const [myTeam, setMyTeam] = useState(null);
  const [currentTurnId, setCurrentTurnId] = useState(0);

  const [createName, setCreateName] = useState('');
  const [joinName, setJoinName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [showJoinForm, setShowJoinForm] = useState(false);

  const [categories, setCategories] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [targetScore, setTargetScore] = useState(50);
  const [roundTime, setRoundTime] = useState(DEFAULT_ROUND_TIME);

  const [players, setPlayers] = useState([]);
  const [hostId, setHostId] = useState(null);

  const [scores, setScores] = useState({ 1: 0, 2: 0 });
  const [timerLeft, setTimerLeft] = useState(DEFAULT_ROUND_TIME);
  const [currentWord, setCurrentWord] = useState('');
  const [playingTeam, setPlayingTeam] = useState(1);

  const [overlayVisible, setOverlayVisible] = useState(false);
  const [pauseSeconds, setPauseSeconds] = useState(5);
  const [pauseEndsAt, setPauseEndsAt] = useState(null);
  const [stealOverlayVisible, setStealOverlayVisible] = useState(false);
  const [stealSeconds, setStealSeconds] = useState(2);
  const [stealEndsAt, setStealEndsAt] = useState(null);
  const [stealCanSubmit, setStealCanSubmit] = useState(false);

  const [winner, setWinner] = useState(null);
  const [wordResult, setWordResult] = useState(null);
  const [toast, setToast] = useState('');

  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeDragging, setSwipeDragging] = useState(false);
  const [swipeExit, setSwipeExit] = useState(null);
  const [swipeEntering, setSwipeEntering] = useState(false);

  useEffect(() => {
    myIdRef.current = myId;
  }, [myId]);

  useEffect(() => {
    myNameRef.current = myName;
  }, [myName]);

  useEffect(() => {
    roomCodeRef.current = roomCode;
  }, [roomCode]);

  useEffect(() => {
    myTeamRef.current = myTeam;
  }, [myTeam]);

  useEffect(() => {
    currentTurnIdRef.current = currentTurnId;
  }, [currentTurnId]);

  useEffect(() => {
    roundTimeRef.current = roundTime;
  }, [roundTime]);

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  const showToast = useCallback((message) => {
    if (!message) return;
    setToast(message);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setToast('');
      toastTimerRef.current = null;
    }, 3000);
  }, []);

  const clearSwipeTimers = useCallback(() => {
    if (swipeExitTimerRef.current) {
      clearTimeout(swipeExitTimerRef.current);
      swipeExitTimerRef.current = null;
    }
    if (swipeEnterTimerRef.current) {
      clearTimeout(swipeEnterTimerRef.current);
      swipeEnterTimerRef.current = null;
    }
  }, []);

  const resetSwipeCard = useCallback(() => {
    clearSwipeTimers();
    swipeRef.current.dragging = false;
    swipeRef.current.deltaX = 0;
    swipeRef.current.pointerId = null;
    swipeRef.current.isAnimating = false;
    setSwipeDragging(false);
    setSwipeOffset(0);
    setSwipeExit(null);
    setSwipeEntering(false);
  }, [clearSwipeTimers]);

  const triggerSwipe = useCallback((direction) => {
    if (role !== 'guesser') return;

    const socket = socketRef.current;
    const swipe = swipeRef.current;
    if (swipe.isAnimating) return;

    swipe.isAnimating = true;
    swipe.dragging = false;
    swipe.deltaX = 0;
    setSwipeDragging(false);

    if (direction === 'right') {
      socket?.emit('guess');
      navigator.vibrate?.(50);
    } else {
      socket?.emit('skip');
      navigator.vibrate?.(30);
    }

    setSwipeExit(direction);

    clearSwipeTimers();
    swipeExitTimerRef.current = setTimeout(() => {
      setSwipeExit(null);
      setSwipeOffset(0);
      setSwipeEntering(true);

      swipeEnterTimerRef.current = setTimeout(() => {
        setSwipeEntering(false);
        swipeRef.current.isAnimating = false;
        swipeEnterTimerRef.current = null;
      }, SWIPE_ENTER_MS);

      swipeExitTimerRef.current = null;
    }, SWIPE_EXIT_MS);
  }, [clearSwipeTimers, role]);

  const handleSwipePointerDown = useCallback((event) => {
    if (role !== 'guesser') return;

    const swipe = swipeRef.current;
    if (swipe.isAnimating) return;

    swipe.dragging = true;
    swipe.startX = event.clientX;
    swipe.deltaX = 0;
    swipe.pointerId = event.pointerId;

    setSwipeDragging(true);
    setSwipeEntering(false);
    setSwipeExit(null);
    setSwipeOffset(0);

    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [role]);

  const handleSwipePointerMove = useCallback((event) => {
    const swipe = swipeRef.current;
    if (!swipe.dragging) return;

    swipe.deltaX = event.clientX - swipe.startX;
    setSwipeOffset(clamp(swipe.deltaX, -SWIPE_CLAMP_PX, SWIPE_CLAMP_PX));
  }, []);

  const finishSwipeGesture = useCallback((event) => {
    const swipe = swipeRef.current;
    if (!swipe.dragging) return;

    swipe.dragging = false;
    setSwipeDragging(false);

    if (swipe.pointerId !== null) {
      event.currentTarget.releasePointerCapture?.(swipe.pointerId);
    }

    if (Math.abs(swipe.deltaX) >= SWIPE_TRIGGER_PX) {
      triggerSwipe(swipe.deltaX > 0 ? 'right' : 'left');
      return;
    }

    setSwipeOffset(0);
  }, [triggerSwipe]);

  const cancelSwipeGesture = useCallback((event) => {
    const swipe = swipeRef.current;
    if (!swipe.dragging) return;

    swipe.dragging = false;
    swipe.deltaX = 0;
    setSwipeDragging(false);

    if (swipe.pointerId !== null) {
      event.currentTarget.releasePointerCapture?.(swipe.pointerId);
    }

    setSwipeOffset(0);
  }, []);

  useEffect(() => {
    if (role === 'guesser') return;
    resetSwipeCard();
  }, [role, resetSwipeCard]);

  useEffect(() => {
    if (screen !== 'game' || role !== 'guesser') return undefined;

    const onKeyDown = (event) => {
      if (event.repeat) return;
      if (event.key === 'ArrowRight' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        triggerSwipe('right');
      }
      if (event.key === 'ArrowLeft' || event.key === 'Backspace') {
        event.preventDefault();
        triggerSwipe('left');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [role, screen, triggerSwipe]);

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    const requestCategories = () => {
      socket.emit('get-categories', (incomingCategories = []) => {
        if (!Array.isArray(incomingCategories)) return;
        setCategories(incomingCategories);
        setSelectedCategories(incomingCategories);
      });
    };

    socket.on('connect', () => {
      const currentId = socket.id || '';
      setMyId(currentId);
      const sessionId = getOrCreatePlayerSessionId();

      requestCategories();

      const saved = readSession();
      if (!saved?.roomCode || !saved?.myName) return;

      setMyName(saved.myName);
      setRoomCode(saved.roomCode);
      setJoinName(saved.myName);
      setJoinCode(saved.roomCode);
      socket.emit('join-room', {
        code: saved.roomCode,
        playerName: saved.myName,
        playerSessionId: sessionId
      });
    });

    socket.on('room-created', ({ code }) => {
      setRoomCode(code);
      setScreen('lobby');
      setCurrentTurnId(0);

      const currentName = myNameRef.current;
      if (currentName) {
        socket.emit('join-room', {
          code,
          playerName: currentName,
          playerSessionId: getOrCreatePlayerSessionId()
        });
        writeSession(code, currentName);
      }
    });

    socket.on('player-joined', ({ players: incomingPlayers, hostId: incomingHostId }) => {
      setPlayers(incomingPlayers || []);
      setHostId(incomingHostId || null);
      setIsHost(incomingHostId === socket.id);
      const me = (incomingPlayers || []).find((player) => player.id === socket.id);
      setMyTeam(me?.team ?? null);

      const activeScreen = screenRef.current;
      if (activeScreen === 'home' || activeScreen === 'create') {
        setScreen('lobby');
      }
    });

    socket.on('game-started', ({
      team,
      explainerId,
      guesserId,
      roundTime: payloadRoundTime,
      myRole,
      myTeam: payloadTeam,
      turnId
    }) => {
      if (Number.isFinite(turnId) && turnId < currentTurnIdRef.current) return;
      if (Number.isFinite(turnId)) {
        setCurrentTurnId(turnId);
      }

      const currentId = socket.id || myIdRef.current;
      setMyId(currentId);

      setScreen('game');
      setOverlayVisible(false);
      setPauseEndsAt(null);
      setPauseSeconds(0);
      setStealOverlayVisible(false);
      setStealEndsAt(null);
      setStealSeconds(0);
      setStealCanSubmit(false);

      const nextRoundTime = Number.isFinite(payloadRoundTime)
        ? payloadRoundTime
        : roundTimeRef.current;

      setRoundTime(nextRoundTime);
      setTimerLeft(nextRoundTime);
      setPlayingTeam(team);
      setCurrentWord('');
      resetSwipeCard();

      if (payloadTeam != null) {
        setMyTeam(payloadTeam);
      }

      const resolvedRole = ['explainer', 'guesser', 'observer'].includes(myRole)
        ? myRole
        : currentId === explainerId
          ? 'explainer'
          : currentId === guesserId
            ? 'guesser'
            : 'observer';

      setRole(resolvedRole);
      if (resolvedRole === 'guesser' && localStorage.getItem(SWIPE_HINT_KEY) !== '1') {
        showToast('Подсказка: свайп вправо = угадал, влево = пропуск');
        localStorage.setItem(SWIPE_HINT_KEY, '1');
      }
    });

    socket.on('new-word', ({ word }) => {
      setCurrentWord(word || '');
    });

    socket.on('word-result', ({ result, scores: nextScores }) => {
      if (nextScores) {
        setScores(nextScores);
      }
      setWordResult(result || null);

      if (wordResultTimerRef.current) {
        clearTimeout(wordResultTimerRef.current);
      }
      wordResultTimerRef.current = setTimeout(() => {
        setWordResult(null);
        wordResultTimerRef.current = null;
      }, 600);
    });

    socket.on('tick', ({ secondsLeft }) => {
      if (!Number.isFinite(secondsLeft)) return;
      setTimerLeft(secondsLeft);

      if (secondsLeft <= 5) {
        navigator.vibrate?.(30);
      }
    });

    socket.on('steal-window-started', ({
      duration = 2,
      stealEndsAt: stealEndsAtPayload,
      playingTeam: activeTeam,
      turnId
    }) => {
      if (Number.isFinite(turnId) && turnId < currentTurnIdRef.current) return;
      if (Number.isFinite(turnId)) {
        setCurrentTurnId(turnId);
      }

      const now = Date.now();
      const nextStealEndsAt = Number.isFinite(stealEndsAtPayload)
        ? stealEndsAtPayload
        : now + duration * 1000;
      const canSteal = myTeamRef.current != null && activeTeam != null && myTeamRef.current !== activeTeam;

      setRole('observer');
      setOverlayVisible(false);
      setPauseEndsAt(null);
      setPauseSeconds(0);
      setStealOverlayVisible(true);
      setStealEndsAt(nextStealEndsAt);
      setStealSeconds(Math.max(0, Math.ceil((nextStealEndsAt - now) / 1000)));
      setStealCanSubmit(canSteal);
      if (activeTeam != null) {
        setPlayingTeam(activeTeam);
      }
    });

    socket.on('steal-word-result', ({ team, scores: nextScores }) => {
      if (nextScores) {
        setScores(nextScores);
      }
      showToast(`Команда ${team} перехватила слово (+1)`);
    });

    socket.on('turn-end', ({ scores: nextScores, pauseDuration = 5, pauseEndsAt: pauseEndsAtPayload, turnId }) => {
      if (Number.isFinite(turnId) && turnId < currentTurnIdRef.current) return;
      if (Number.isFinite(turnId)) {
        setCurrentTurnId(turnId);
      }

      if (nextScores) {
        setScores(nextScores);
      }
      const now = Date.now();
      const nextPauseEndsAt = Number.isFinite(pauseEndsAtPayload)
        ? pauseEndsAtPayload
        : now + pauseDuration * 1000;

      setRole('observer');
      setStealOverlayVisible(false);
      setStealEndsAt(null);
      setStealSeconds(0);
      setStealCanSubmit(false);
      setOverlayVisible(true);
      setPauseEndsAt(nextPauseEndsAt);
      setPauseSeconds(Math.max(0, Math.ceil((nextPauseEndsAt - now) / 1000)));
    });

    socket.on('game-over', ({ winner: winningTeam, scores: finalScores }) => {
      setOverlayVisible(false);
      setPauseEndsAt(null);
      setPauseSeconds(0);
      setStealOverlayVisible(false);
      setStealEndsAt(null);
      setStealSeconds(0);
      setStealCanSubmit(false);
      setRole(null);
      if (finalScores) {
        setScores(finalScores);
      }
      setWinner(winningTeam);
      setScreen('results');
    });

    socket.on('error', ({ message }) => {
      showToast(message || 'Ошибка сервера');
    });

    socket.on('connect_error', () => {
      showToast('Проблема с подключением. Переподключаемся...');
    });

    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (wordResultTimerRef.current) clearTimeout(wordResultTimerRef.current);
      clearSwipeTimers();
      socket.disconnect();
    };
  }, [clearSwipeTimers, resetSwipeCard, showToast]);

  useEffect(() => {
    if (!overlayVisible || !pauseEndsAt) return undefined;
    const updateCountdown = () => {
      setPauseSeconds(Math.max(0, Math.ceil((pauseEndsAt - Date.now()) / 1000)));
    };
    updateCountdown();
    const intervalId = setInterval(updateCountdown, 250);
    return () => clearInterval(intervalId);
  }, [overlayVisible, pauseEndsAt]);

  useEffect(() => {
    if (!stealOverlayVisible || !stealEndsAt) return undefined;
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((stealEndsAt - Date.now()) / 1000));
      setStealSeconds(remaining);
      if (remaining <= 0) {
        setStealCanSubmit(false);
      }
    };
    updateCountdown();
    const intervalId = setInterval(updateCountdown, 200);
    return () => clearInterval(intervalId);
  }, [stealOverlayVisible, stealEndsAt]);

  const team1Count = useMemo(
    () => players.filter((player) => player.team === 1).length,
    [players]
  );

  const team2Count = useMemo(
    () => players.filter((player) => player.team === 2).length,
    [players]
  );

  const readyToStart = players.length === 4 && team1Count === 2 && team2Count === 2;

  const lobbyStatus = useMemo(() => {
    if (players.length < 4) {
      return `Ожидание игроков (${players.length}/4)`;
    }
    if (readyToStart) {
      return 'Все готовы!';
    }
    return 'Распределите по командам 2+2';
  }, [players.length, readyToStart]);

  const timerProgress = useMemo(() => {
    const circumference = 283;
    const safeRoundTime = Math.max(1, roundTime);
    const progress = (Math.max(0, timerLeft) / safeRoundTime) * circumference;
    return circumference - progress;
  }, [roundTime, timerLeft]);

  const timerProgressClass = timerLeft <= 5
    ? 'timer-progress danger'
    : timerLeft <= 15
      ? 'timer-progress warning'
      : 'timer-progress';

  const timerContainerClass = timerLeft <= 5 ? 'timer-container pulse' : 'timer-container';

  const swipeStrength = Math.min(1, Math.abs(swipeOffset) / SWIPE_TRIGGER_PX);
  const swipeRotation = clamp(swipeOffset * 0.1, -SWIPE_MAX_ROTATION, SWIPE_MAX_ROTATION);

  const swipeCardClassName = [
    'swipe-card',
    swipeOffset < -20 ? 'swiping-left' : '',
    swipeOffset > 20 ? 'swiping-right' : '',
    swipeExit === 'left' ? 'exit-left' : '',
    swipeExit === 'right' ? 'exit-right' : '',
    swipeEntering ? 'entering' : ''
  ]
    .filter(Boolean)
    .join(' ');

  const swipeCardStyle = (swipeExit || swipeEntering)
    ? undefined
    : {
      transform: `translateX(${swipeOffset}px) rotate(${swipeRotation}deg)`,
      transition: swipeDragging ? 'none' : 'transform 180ms ease'
    };

  const handleCreateRoom = () => {
    const trimmedName = createName.trim();
    if (!trimmedName) {
      showToast('Введите имя');
      return;
    }

    if (selectedCategories.length === 0) {
      showToast('Выберите хотя бы одну категорию');
      return;
    }

    setMyName(trimmedName);
    setIsHost(true);
    setCurrentTurnId(0);

    socketRef.current?.emit('create-room', {
      categories: selectedCategories,
      targetScore,
      roundTime
    });
  };

  const handleJoinRoom = () => {
    const code = joinCode.trim();
    const trimmedName = joinName.trim();

    if (!code || !trimmedName) {
      showToast('Введите код и имя');
      return;
    }

    setMyName(trimmedName);
    setRoomCode(code);
    setCurrentTurnId(0);
    const sessionId = getOrCreatePlayerSessionId();

    socketRef.current?.emit('join-room', {
      code,
      playerName: trimmedName,
      playerSessionId: sessionId
    });
    writeSession(code, trimmedName);
  };

  const handleSwitchTeam = (player) => {
    if (!isHost) return;
    const nextTeam = !player.team ? 1 : player.team === 1 ? 2 : 1;
    socketRef.current?.emit('switch-team', { playerId: player.id, team: nextTeam });
  };

  const handleStartGame = () => {
    socketRef.current?.emit('start-game');
  };

  const handleCopyCode = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      showToast('Код скопирован');
    } catch {
      showToast('Не удалось скопировать код');
    }
  };

  const handleStealWord = () => {
    if (!stealCanSubmit) return;
    socketRef.current?.emit('steal-word');
    setStealCanSubmit(false);
  };

  const handlePlayAgain = () => {
    clearSession();

    setScreen('home');
    setMyName('');
    setCreateName('');
    setJoinName('');
    setJoinCode('');
    setRoomCode('');
    setPlayers([]);
    setHostId(null);
    setIsHost(false);
    setRole(null);
    setMyTeam(null);
    setCurrentTurnId(0);
    setScores({ 1: 0, 2: 0 });
    setTimerLeft(DEFAULT_ROUND_TIME);
    setCurrentWord('');
    setPlayingTeam(1);
    setOverlayVisible(false);
    setPauseEndsAt(null);
    setPauseSeconds(5);
    setStealOverlayVisible(false);
    setStealEndsAt(null);
    setStealSeconds(2);
    setStealCanSubmit(false);
    setWinner(null);
    setWordResult(null);
    resetSwipeCard();

    const socket = socketRef.current;
    if (socket?.connected) {
      socket.disconnect();
      socket.connect();
    }
  };

  return (
    <>
      <div id="home" className={`screen ${screen === 'home' ? 'active' : ''}`}>
        <div className="logo">ALIAS</div>
        <p className="subtitle">Угадай слово!</p>
        <button type="button" id="btn-create" className="btn btn-primary" onClick={() => setScreen('create')}>
          Создать игру
        </button>
        <button
          type="button"
          id="btn-join"
          className="btn btn-secondary"
          onClick={() => setShowJoinForm((prev) => !prev)}
        >
          Войти по коду
        </button>
        <div id="join-form" className={showJoinForm ? '' : 'hidden'}>
          <input
            id="input-code"
            type="text"
            maxLength={4}
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value)}
            placeholder="Код комнаты"
            inputMode="numeric"
          />
          <input
            id="input-name-join"
            type="text"
            maxLength={20}
            value={joinName}
            onChange={(event) => setJoinName(event.target.value)}
            placeholder="Ваше имя"
          />
          <button type="button" id="btn-join-submit" className="btn btn-primary" onClick={handleJoinRoom}>
            Войти
          </button>
        </div>
      </div>

      <div id="create" className={`screen ${screen === 'create' ? 'active' : ''}`}>
        <h2>Новая игра</h2>
        <div className="form-group">
          <label>Категории</label>
          <div id="categories-list" className="categories">
            {categories.map((category) => {
              const selected = selectedCategories.includes(category);
              return (
                <button
                  key={category}
                  type="button"
                  className={`category-chip ${selected ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedCategories((prev) => {
                      if (prev.includes(category)) {
                        return prev.filter((item) => item !== category);
                      }
                      return [...prev, category];
                    });
                  }}
                >
                  {category}
                </button>
              );
            })}
          </div>
        </div>

        <div className="form-group">
          <label>Очков для победы</label>
          <div className="radio-group" id="target-score-group">
            {TARGET_SCORE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={`radio-btn ${targetScore === option ? 'selected' : ''}`}
                onClick={() => setTargetScore(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>Время раунда</label>
          <div className="radio-group" id="round-time-group">
            {ROUND_TIME_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={`radio-btn ${roundTime === option ? 'selected' : ''}`}
                onClick={() => {
                  setRoundTime(option);
                  setTimerLeft(option);
                }}
              >
                {option}с
              </button>
            ))}
          </div>
        </div>

        <input
          id="input-name-create"
          type="text"
          maxLength={20}
          value={createName}
          onChange={(event) => setCreateName(event.target.value)}
          placeholder="Ваше имя"
        />
        <button type="button" id="btn-create-room" className="btn btn-primary" onClick={handleCreateRoom}>
          Создать
        </button>
      </div>

      <div id="lobby" className={`screen ${screen === 'lobby' ? 'active' : ''}`}>
        <div className="room-code">
          Код: <span id="room-code-display">{roomCode}</span>
          <button type="button" id="btn-copy-code" className="btn-icon" title="Скопировать" onClick={handleCopyCode}>
            📋
          </button>
        </div>
        <p id="lobby-status" className="lobby-status">{lobbyStatus}</p>

        <div className="teams-container">
          <div className="team team-1">
            <h3>Команда 1</h3>
            <div id="team-1-players" className="player-list">
              {players.filter((player) => player.team === 1).map((player) => (
                <div
                  key={player.id}
                  className={`player-tag ${player.disconnected ? 'disconnected' : ''}`}
                  onClick={() => handleSwitchTeam(player)}
                  style={{ cursor: isHost ? 'pointer' : 'default' }}
                  role={isHost ? 'button' : undefined}
                  tabIndex={isHost ? 0 : -1}
                  onKeyDown={(event) => {
                    if (!isHost) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleSwitchTeam(player);
                    }
                  }}
                >
                  <span>
                    {player.name}
                    {player.id === myId ? ' (Вы)' : ''}
                    {player.disconnected ? ' (оффлайн)' : ''}
                  </span>
                  {player.id === hostId ? <span className="host-badge">Хост</span> : null}
                </div>
              ))}
            </div>
          </div>

          <div className="team team-2">
            <h3>Команда 2</h3>
            <div id="team-2-players" className="player-list">
              {players.filter((player) => player.team === 2).map((player) => (
                <div
                  key={player.id}
                  className={`player-tag ${player.disconnected ? 'disconnected' : ''}`}
                  onClick={() => handleSwitchTeam(player)}
                  style={{ cursor: isHost ? 'pointer' : 'default' }}
                  role={isHost ? 'button' : undefined}
                  tabIndex={isHost ? 0 : -1}
                  onKeyDown={(event) => {
                    if (!isHost) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleSwitchTeam(player);
                    }
                  }}
                >
                  <span>
                    {player.name}
                    {player.id === myId ? ' (Вы)' : ''}
                    {player.disconnected ? ' (оффлайн)' : ''}
                  </span>
                  {player.id === hostId ? <span className="host-badge">Хост</span> : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div id="unassigned-players" className="unassigned">
          <h4>Без команды</h4>
          <div id="unassigned-list" className="player-list">
            {players.filter((player) => !player.team).map((player) => (
              <div
                key={player.id}
                className={`player-tag ${player.disconnected ? 'disconnected' : ''}`}
                onClick={() => handleSwitchTeam(player)}
                style={{ cursor: isHost ? 'pointer' : 'default' }}
                role={isHost ? 'button' : undefined}
                tabIndex={isHost ? 0 : -1}
                onKeyDown={(event) => {
                  if (!isHost) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleSwitchTeam(player);
                  }
                }}
              >
                <span>
                  {player.name}
                  {player.id === myId ? ' (Вы)' : ''}
                  {player.disconnected ? ' (оффлайн)' : ''}
                </span>
                {player.id === hostId ? <span className="host-badge">Хост</span> : null}
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          id="btn-start"
          className={`btn btn-primary ${isHost ? '' : 'hidden'}`}
          disabled={!readyToStart}
          onClick={handleStartGame}
        >
          {readyToStart ? 'Начать игру' : `Начать игру (${team1Count}/2 vs ${team2Count}/2)`}
        </button>
      </div>

      <div id="game" className={`screen ${screen === 'game' ? 'active' : ''}`}>
        <div className="game-header">
          <div className="scores">
            <span className="score team-1-score">{scores[1]}</span>
            <span className="score-divider">:</span>
            <span className="score team-2-score">{scores[2]}</span>
          </div>

          <div className={timerContainerClass}>
            <svg className="timer-ring" viewBox="0 0 100 100">
              <circle className="timer-bg" cx="50" cy="50" r="45" />
              <circle className={timerProgressClass} cx="50" cy="50" r="45" style={{ strokeDashoffset: timerProgress }} />
            </svg>
            <span id="timer-text" className="timer-text">{Math.max(0, timerLeft)}</span>
          </div>
        </div>

        <div id="explainer-view" className={`game-role ${role === 'explainer' ? '' : 'hidden'}`}>
          <div className="role-label">Вы объясняете</div>
          <div id="current-word" className="word-display">{currentWord}</div>
        </div>

        <div id="guesser-view" className={`game-role ${role === 'guesser' ? '' : 'hidden'}`}>
          <div className="role-label">Вы угадываете</div>

          <div id="swipe-area" className="swipe-area">
            <div id="swipe-hint-left" className="swipe-hint swipe-hint-left" style={{ opacity: swipeOffset < 0 ? swipeStrength : 0 }}>
              Пропуск
            </div>
            <div id="swipe-hint-right" className="swipe-hint swipe-hint-right" style={{ opacity: swipeOffset > 0 ? swipeStrength : 0 }}>
              Угадал!
            </div>

            <div
              id="swipe-card"
              className={swipeCardClassName}
              style={swipeCardStyle}
              onPointerDown={handleSwipePointerDown}
              onPointerMove={handleSwipePointerMove}
              onPointerUp={finishSwipeGesture}
              onPointerCancel={cancelSwipeGesture}
            >
              <div className="swipe-card-icon">👂</div>
              <div className="swipe-card-text">Слушайте объяснение</div>
              <div className="swipe-card-hint">
                <span className="hint-left">← Пропуск</span>
                <span className="hint-right">Угадал! →</span>
              </div>
            </div>
          </div>

          <div className="guesser-buttons">
            <button type="button" id="btn-guess" className="btn-game btn-guess" onClick={() => triggerSwipe('right')}>
              ✓
            </button>
            <button type="button" id="btn-skip" className="btn-game btn-skip" onClick={() => triggerSwipe('left')}>
              ✗
            </button>
          </div>
        </div>

        <div id="observer-view" className={`game-role ${role === 'observer' ? '' : 'hidden'}`}>
          <div className="role-label">Ход команды <span id="playing-team">{playingTeam}</span></div>
          <div className="waiting-message">Ждём ход...</div>
        </div>

        <div id="word-result" className={`word-result ${wordResult ? wordResult : 'hidden'}`}>
          {wordResult === 'guessed' ? '+1' : wordResult === 'skipped' ? '-1' : ''}
        </div>

        <div id="turn-overlay" className={`overlay ${overlayVisible ? '' : 'hidden'}`}>
          <div className="overlay-content">
            <h2>Конец раунда</h2>
            <div className="overlay-scores">
              <span className="team-1-score">{scores[1]}</span> : <span className="team-2-score">{scores[2]}</span>
            </div>
            <div id="pause-countdown" className="pause-countdown">
              Следующий раунд через <span id="pause-seconds">{pauseSeconds}</span>
            </div>
          </div>
        </div>

        <div id="steal-overlay" className={`overlay ${stealOverlayVisible ? '' : 'hidden'}`}>
          <div className="overlay-content steal-overlay-content">
            <h2>Перехват слова</h2>
            <p className="steal-text">Ход команды <span id="steal-playing-team">{playingTeam}</span> завершён.</p>
            <p className="steal-countdown">Окно перехвата: <span id="steal-seconds">{stealSeconds}</span></p>
            <button
              type="button"
              id="btn-steal-word"
              className={`btn btn-primary ${stealCanSubmit ? '' : 'hidden'}`}
              onClick={handleStealWord}
              disabled={!stealCanSubmit}
            >
              Перехват +1
            </button>
          </div>
        </div>
      </div>

      <div id="results" className={`screen ${screen === 'results' ? 'active' : ''}`}>
        <div className="winner-banner">
          <h1 id="winner-text">{winner ? `Команда ${winner} победила!` : 'Игра завершена'}</h1>
        </div>
        <div className="final-scores">
          <div className="final-team team-1">
            <h3>Команда 1</h3>
            <span id="final-score-1" className="final-score">{scores[1]}</span>
          </div>
          <div className="final-team team-2">
            <h3>Команда 2</h3>
            <span id="final-score-2" className="final-score">{scores[2]}</span>
          </div>
        </div>
        <button type="button" id="btn-play-again" className="btn btn-primary" onClick={handlePlayAgain}>
          Играть снова
        </button>
      </div>

      <div id="error-toast" className={`toast ${toast ? '' : 'hidden'}`}>{toast}</div>
    </>
  );
}
