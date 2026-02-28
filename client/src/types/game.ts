export type Screen = 'home' | 'create' | 'lobby' | 'game' | 'results';
export type Role = 'explainer' | 'guesser' | 'observer';
export type Team = 1 | 2;
export type SwipeDirection = 'left' | 'right';

export interface Scores {
  1: number;
  2: number;
}

export interface Player {
  id: string;
  name: string;
  team: Team | null;
  disconnected?: boolean;
  sessionId?: string | null;
}

export interface SessionData {
  roomCode: string;
  myName: string;
}

export interface RoomCreatedPayload {
  code: string;
}

export interface PlayersPayload {
  players: Player[];
  hostId: string | null;
}

export interface GameStartedPayload {
  team: Team;
  explainerId: string;
  guesserId: string;
  roundTime?: number;
  myRole?: Role;
  myTeam?: Team | null;
  turnId?: number;
}

export interface NewWordPayload {
  word: string;
}

export interface WordResultPayload {
  result: 'guessed' | 'skipped';
  scores: Scores;
}

export interface TickPayload {
  secondsLeft: number;
}

export interface StealWindowPayload {
  duration?: number;
  stealEndsAt?: number;
  playingTeam?: Team | null;
  turnId?: number;
}

export interface StealWordResultPayload {
  team: Team;
  scores: Scores;
}

export interface TurnEndPayload {
  scores: Scores;
  pauseDuration?: number;
  pauseEndsAt?: number;
  turnId?: number;
}

export interface GameOverPayload {
  winner: Team;
  scores: Scores;
}

export interface ErrorPayload {
  message: string;
}
