import { PLAYER_SESSION_ID_KEY, SESSION_STORAGE_KEY } from '../config/constants';
import type { SessionData } from '../types/game';

export function readSession(): SessionData | null {
  const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as SessionData;
    if (!parsed.roomCode || !parsed.myName) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSession(roomCode: string, myName: string): void {
  if (!roomCode || !myName) return;
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ roomCode, myName }));
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

export function getOrCreatePlayerSessionId(): string {
  const existing = localStorage.getItem(PLAYER_SESSION_ID_KEY);
  if (existing) return existing;

  const generated =
    crypto?.randomUUID?.() ||
    `alias-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  localStorage.setItem(PLAYER_SESSION_ID_KEY, generated);
  return generated;
}
