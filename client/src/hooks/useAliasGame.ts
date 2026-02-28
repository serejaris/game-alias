import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  DEFAULT_ROUND_TIME,
  ROUND_TIME_OPTIONS,
  SWIPE_HINT_KEY,
  TARGET_SCORE_OPTIONS
} from '../config/constants';
import { resolveRole, isStaleTurn } from '../utils/role';
import { clearSession, getOrCreatePlayerSessionId, readSession, writeSession } from '../utils/storage';
import { getSecondsRemaining, resolveDeadline } from '../utils/time';
import type {
  ErrorPayload,
  GameOverPayload,
  GameStartedPayload,
  NewWordPayload,
  Player,
  PlayersPayload,
  Role,
  RoomCreatedPayload,
  Scores,
  Screen,
  StealWordResultPayload,
  StealWindowPayload,
  SwipeDirection,
  Team,
  TickPayload,
  TurnEndPayload,
  WordResultPayload
} from '../types/game';

const INITIAL_SCORES: Scores = { 1: 0, 2: 0 };

export interface AliasGameState {
  screen: Screen;
  myId: string;
  roomCode: string;
  isHost: boolean;
  role: Role | null;
  myTeam: Team | null;
  createName: string;
  joinName: string;
  joinCode: string;
  showJoinForm: boolean;
  categories: string[];
  selectedCategories: string[];
  targetScore: number;
  roundTime: number;
  players: Player[];
  hostId: string | null;
  scores: Scores;
  timerLeft: number;
  currentWord: string;
  playingTeam: Team;
  overlayVisible: boolean;
  pauseSeconds: number;
  stealOverlayVisible: boolean;
  stealSeconds: number;
  stealCanSubmit: boolean;
  winner: Team | null;
  wordResult: 'guessed' | 'skipped' | null;
  toast: string;
  team1Count: number;
  team2Count: number;
  readyToStart: boolean;
  lobbyStatus: string;
  timerProgressOffset: number;
  timerProgressClass: string;
  timerContainerClass: string;
}

export interface AliasGameActions {
  setScreen: (screen: Screen) => void;
  setCreateName: (value: string) => void;
  setJoinName: (value: string) => void;
  setJoinCode: (value: string) => void;
  toggleJoinForm: () => void;
  toggleCategory: (category: string) => void;
  selectTargetScore: (value: number) => void;
  selectRoundTime: (value: number) => void;
  createRoom: () => void;
  joinRoom: () => void;
  switchTeam: (player: Player) => void;
  startGame: () => void;
  copyCode: () => Promise<void>;
  submitGuesserAction: (direction: SwipeDirection) => boolean;
  submitStealWord: () => void;
  playAgain: () => void;
}

function defaultLobbyStatus(playersCount: number, readyToStart: boolean): string {
  if (playersCount < 4) return `Ожидание игроков (${playersCount}/4)`;
  if (readyToStart) return 'Все готовы!';
  return 'Распределите по командам 2+2';
}

export function useAliasGame(): { state: AliasGameState; actions: AliasGameActions } {
  const socketRef = useRef<Socket | null>(null);
  const myIdRef = useRef('');
  const myNameRef = useRef('');
  const myTeamRef = useRef<Team | null>(null);
  const currentTurnIdRef = useRef(0);
  const roundTimeRef = useRef(DEFAULT_ROUND_TIME);
  const screenRef = useRef<Screen>('home');

  const toastTimerRef = useRef<number | null>(null);
  const wordResultTimerRef = useRef<number | null>(null);

  const [screen, setScreen] = useState<Screen>('home');
  const [myId, setMyId] = useState('');
  const [myName, setMyName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [role, setRole] = useState<Role | null>(null);
  const [myTeam, setMyTeam] = useState<Team | null>(null);
  const [currentTurnId, setCurrentTurnId] = useState(0);

  const [createName, setCreateName] = useState('');
  const [joinName, setJoinName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [showJoinForm, setShowJoinForm] = useState(false);

  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [targetScore, setTargetScore] = useState<number>(TARGET_SCORE_OPTIONS[1]);
  const [roundTime, setRoundTime] = useState<number>(ROUND_TIME_OPTIONS[2]);

  const [players, setPlayers] = useState<Player[]>([]);
  const [hostId, setHostId] = useState<string | null>(null);

  const [scores, setScores] = useState<Scores>(INITIAL_SCORES);
  const [timerLeft, setTimerLeft] = useState(DEFAULT_ROUND_TIME);
  const [currentWord, setCurrentWord] = useState('');
  const [playingTeam, setPlayingTeam] = useState<Team>(1);

  const [overlayVisible, setOverlayVisible] = useState(false);
  const [pauseSeconds, setPauseSeconds] = useState(5);
  const [pauseEndsAt, setPauseEndsAt] = useState<number | null>(null);

  const [stealOverlayVisible, setStealOverlayVisible] = useState(false);
  const [stealSeconds, setStealSeconds] = useState(2);
  const [stealEndsAt, setStealEndsAt] = useState<number | null>(null);
  const [stealCanSubmit, setStealCanSubmit] = useState(false);

  const [winner, setWinner] = useState<Team | null>(null);
  const [wordResult, setWordResult] = useState<'guessed' | 'skipped' | null>(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    myIdRef.current = myId;
  }, [myId]);

  useEffect(() => {
    myNameRef.current = myName;
  }, [myName]);

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

  const showToast = useCallback((message: string) => {
    if (!message) return;

    setToast(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }

    toastTimerRef.current = window.setTimeout(() => {
      setToast('');
      toastTimerRef.current = null;
    }, 3000);
  }, []);

  const requestCategories = useCallback((socket: Socket) => {
    socket.emit('get-categories', (incomingCategories: string[] = []) => {
      if (!Array.isArray(incomingCategories)) return;
      setCategories(incomingCategories);
      setSelectedCategories(incomingCategories);
    });
  }, []);

  const resetTransientOverlays = useCallback(() => {
    setOverlayVisible(false);
    setPauseEndsAt(null);
    setPauseSeconds(0);

    setStealOverlayVisible(false);
    setStealEndsAt(null);
    setStealSeconds(0);
    setStealCanSubmit(false);
  }, []);

  const submitGuesserAction = useCallback((direction: SwipeDirection): boolean => {
    if (role !== 'guesser') return false;

    const socket = socketRef.current;
    const eventName = direction === 'right' ? 'guess' : 'skip';
    socket?.emit(eventName);
    navigator.vibrate?.(direction === 'right' ? 50 : 30);
    return true;
  }, [role]);

  const submitStealWord = useCallback(() => {
    if (!stealCanSubmit) return;
    socketRef.current?.emit('steal-word');
    setStealCanSubmit(false);
  }, [stealCanSubmit]);

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => {
      const currentId = socket.id || '';
      const playerSessionId = getOrCreatePlayerSessionId();

      setMyId(currentId);
      requestCategories(socket);

      const saved = readSession();
      if (!saved?.roomCode || !saved?.myName) return;

      setMyName(saved.myName);
      setRoomCode(saved.roomCode);
      setJoinName(saved.myName);
      setJoinCode(saved.roomCode);

      socket.emit('join-room', {
        code: saved.roomCode,
        playerName: saved.myName,
        playerSessionId
      });
    });

    socket.on('room-created', ({ code }: RoomCreatedPayload) => {
      setRoomCode(code);
      setScreen('lobby');
      setCurrentTurnId(0);

      const currentName = myNameRef.current;
      if (!currentName) return;

      socket.emit('join-room', {
        code,
        playerName: currentName,
        playerSessionId: getOrCreatePlayerSessionId()
      });
      writeSession(code, currentName);
    });

    socket.on('player-joined', ({ players: incomingPlayers, hostId: incomingHostId }: PlayersPayload) => {
      setPlayers(incomingPlayers || []);
      setHostId(incomingHostId || null);
      setIsHost(incomingHostId === socket.id);

      const me = (incomingPlayers || []).find((player) => player.id === socket.id);
      setMyTeam(me?.team ?? null);

      if (screenRef.current === 'home' || screenRef.current === 'create') {
        setScreen('lobby');
      }
    });

    socket.on('game-started', (payload: GameStartedPayload) => {
      if (isStaleTurn(payload.turnId, currentTurnIdRef.current)) return;
      if (Number.isFinite(payload.turnId)) {
        setCurrentTurnId(payload.turnId as number);
      }

      const currentId = socket.id || myIdRef.current;
      const resolvedRoundTime = Number.isFinite(payload.roundTime)
        ? (payload.roundTime as number)
        : roundTimeRef.current;

      setMyId(currentId);
      setScreen('game');
      resetTransientOverlays();
      setRoundTime(resolvedRoundTime);
      setTimerLeft(resolvedRoundTime);
      setCurrentWord('');
      setPlayingTeam(payload.team);

      if (payload.myTeam != null) {
        setMyTeam(payload.myTeam);
      }

      const nextRole = resolveRole(
        currentId,
        payload.explainerId,
        payload.guesserId,
        payload.myRole
      );
      setRole(nextRole);

      if (nextRole === 'guesser' && localStorage.getItem(SWIPE_HINT_KEY) !== '1') {
        showToast('Подсказка: свайп вправо = угадал, влево = пропуск');
        localStorage.setItem(SWIPE_HINT_KEY, '1');
      }
    });

    socket.on('new-word', ({ word }: NewWordPayload) => {
      setCurrentWord(word || '');
    });

    socket.on('word-result', ({ result, scores: nextScores }: WordResultPayload) => {
      setScores(nextScores);
      setWordResult(result);

      if (wordResultTimerRef.current !== null) {
        window.clearTimeout(wordResultTimerRef.current);
      }

      wordResultTimerRef.current = window.setTimeout(() => {
        setWordResult(null);
        wordResultTimerRef.current = null;
      }, 600);
    });

    socket.on('tick', ({ secondsLeft }: TickPayload) => {
      if (!Number.isFinite(secondsLeft)) return;
      setTimerLeft(secondsLeft);

      if (secondsLeft <= 5) {
        navigator.vibrate?.(30);
      }
    });

    socket.on('steal-window-started', (payload: StealWindowPayload) => {
      if (isStaleTurn(payload.turnId, currentTurnIdRef.current)) return;
      if (Number.isFinite(payload.turnId)) {
        setCurrentTurnId(payload.turnId as number);
      }

      const now = Date.now();
      const activeTeam = payload.playingTeam ?? null;
      const endsAt = resolveDeadline(payload.duration ?? 2, payload.stealEndsAt, now);
      const canSteal =
        myTeamRef.current != null &&
        activeTeam != null &&
        myTeamRef.current !== activeTeam;

      setRole('observer');
      setOverlayVisible(false);
      setPauseEndsAt(null);
      setPauseSeconds(0);

      setStealOverlayVisible(true);
      setStealEndsAt(endsAt);
      setStealSeconds(getSecondsRemaining(endsAt, now));
      setStealCanSubmit(canSteal);

      if (activeTeam != null) {
        setPlayingTeam(activeTeam);
      }
    });

    socket.on('steal-word-result', ({ team, scores: nextScores }: StealWordResultPayload) => {
      setScores(nextScores);
      showToast(`Команда ${team} перехватила слово (+1)`);
    });

    socket.on('turn-end', (payload: TurnEndPayload) => {
      if (isStaleTurn(payload.turnId, currentTurnIdRef.current)) return;
      if (Number.isFinite(payload.turnId)) {
        setCurrentTurnId(payload.turnId as number);
      }

      const now = Date.now();
      const endsAt = resolveDeadline(payload.pauseDuration ?? 5, payload.pauseEndsAt, now);

      setRole('observer');
      setScores(payload.scores);

      setStealOverlayVisible(false);
      setStealEndsAt(null);
      setStealSeconds(0);
      setStealCanSubmit(false);

      setOverlayVisible(true);
      setPauseEndsAt(endsAt);
      setPauseSeconds(getSecondsRemaining(endsAt, now));
    });

    socket.on('game-over', ({ winner: winningTeam, scores: finalScores }: GameOverPayload) => {
      resetTransientOverlays();
      setRole(null);
      setScores(finalScores);
      setWinner(winningTeam);
      setScreen('results');
    });

    socket.on('error', ({ message }: ErrorPayload) => {
      showToast(message || 'Ошибка сервера');
    });

    socket.on('connect_error', () => {
      showToast('Проблема с подключением. Переподключаемся...');
    });

    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      if (wordResultTimerRef.current !== null) {
        window.clearTimeout(wordResultTimerRef.current);
      }
      socket.disconnect();
    };
  }, [requestCategories, resetTransientOverlays, showToast]);

  useEffect(() => {
    if (!overlayVisible || !pauseEndsAt) return;

    const tick = () => {
      setPauseSeconds(getSecondsRemaining(pauseEndsAt));
    };

    tick();
    const intervalId = window.setInterval(tick, 250);
    return () => window.clearInterval(intervalId);
  }, [overlayVisible, pauseEndsAt]);

  useEffect(() => {
    if (!stealOverlayVisible || !stealEndsAt) return;

    const tick = () => {
      const remaining = getSecondsRemaining(stealEndsAt);
      setStealSeconds(remaining);
      if (remaining <= 0) {
        setStealCanSubmit(false);
      }
    };

    tick();
    const intervalId = window.setInterval(tick, 200);
    return () => window.clearInterval(intervalId);
  }, [stealEndsAt, stealOverlayVisible]);

  const team1Count = useMemo(
    () => players.filter((player) => player.team === 1).length,
    [players]
  );
  const team2Count = useMemo(
    () => players.filter((player) => player.team === 2).length,
    [players]
  );

  const readyToStart = players.length === 4 && team1Count === 2 && team2Count === 2;
  const lobbyStatus = defaultLobbyStatus(players.length, readyToStart);

  const timerProgressOffset = useMemo(() => {
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

  const toggleJoinForm = useCallback(() => {
    setShowJoinForm((prev) => !prev);
  }, []);

  const toggleCategory = useCallback((category: string) => {
    setSelectedCategories((prev) => (
      prev.includes(category)
        ? prev.filter((item) => item !== category)
        : [...prev, category]
    ));
  }, []);

  const selectTargetScore = useCallback((value: number) => {
    setTargetScore(value);
  }, []);

  const selectRoundTime = useCallback((value: number) => {
    setRoundTime(value);
    setTimerLeft(value);
  }, []);

  const createRoom = useCallback(() => {
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
  }, [createName, roundTime, selectedCategories, showToast, targetScore]);

  const joinRoom = useCallback(() => {
    const code = joinCode.trim();
    const trimmedName = joinName.trim();

    if (!code || !trimmedName) {
      showToast('Введите код и имя');
      return;
    }

    const playerSessionId = getOrCreatePlayerSessionId();

    setMyName(trimmedName);
    setRoomCode(code);
    setCurrentTurnId(0);

    socketRef.current?.emit('join-room', {
      code,
      playerName: trimmedName,
      playerSessionId
    });

    writeSession(code, trimmedName);
  }, [joinCode, joinName, showToast]);

  const switchTeam = useCallback((player: Player) => {
    if (!isHost) return;
    const nextTeam = !player.team ? 1 : player.team === 1 ? 2 : 1;
    socketRef.current?.emit('switch-team', { playerId: player.id, team: nextTeam });
  }, [isHost]);

  const startGame = useCallback(() => {
    socketRef.current?.emit('start-game');
  }, []);

  const copyCode = useCallback(async () => {
    if (!roomCode) return;

    try {
      await navigator.clipboard.writeText(roomCode);
      showToast('Код скопирован');
    } catch {
      showToast('Не удалось скопировать код');
    }
  }, [roomCode, showToast]);

  const playAgain = useCallback(() => {
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
    setScores(INITIAL_SCORES);
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

    const socket = socketRef.current;
    if (socket?.connected) {
      socket.disconnect();
      socket.connect();
    }
  }, []);

  const state: AliasGameState = {
    screen,
    myId,
    roomCode,
    isHost,
    role,
    myTeam,
    createName,
    joinName,
    joinCode,
    showJoinForm,
    categories,
    selectedCategories,
    targetScore,
    roundTime,
    players,
    hostId,
    scores,
    timerLeft,
    currentWord,
    playingTeam,
    overlayVisible,
    pauseSeconds,
    stealOverlayVisible,
    stealSeconds,
    stealCanSubmit,
    winner,
    wordResult,
    toast,
    team1Count,
    team2Count,
    readyToStart,
    lobbyStatus,
    timerProgressOffset,
    timerProgressClass,
    timerContainerClass
  };

  const actions: AliasGameActions = {
    setScreen,
    setCreateName,
    setJoinName,
    setJoinCode,
    toggleJoinForm,
    toggleCategory,
    selectTargetScore,
    selectRoundTime,
    createRoom,
    joinRoom,
    switchTeam,
    startGame,
    copyCode,
    submitGuesserAction,
    submitStealWord,
    playAgain
  };

  return { state, actions };
}
