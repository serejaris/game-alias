export function resolveDeadline(durationSeconds: number, serverEndsAt?: number, now = Date.now()): number {
  if (Number.isFinite(serverEndsAt) && (serverEndsAt as number) > 0) {
    return serverEndsAt as number;
  }
  return now + durationSeconds * 1000;
}

export function getSecondsRemaining(endsAt: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}
