import type { Role } from '../types/game';

export function resolveRole(
  myId: string,
  explainerId: string,
  guesserId: string,
  serverRole?: Role
): Role {
  if (serverRole && ['explainer', 'guesser', 'observer'].includes(serverRole)) {
    return serverRole;
  }
  if (myId === explainerId) return 'explainer';
  if (myId === guesserId) return 'guesser';
  return 'observer';
}

export function isStaleTurn(nextTurnId: number | undefined, currentTurnId: number): boolean {
  if (!Number.isFinite(nextTurnId)) return false;
  return (nextTurnId as number) < currentTurnId;
}
