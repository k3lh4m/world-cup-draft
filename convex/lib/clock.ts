export function deadlineMs(pickStartedAt: number, clockSeconds: number): number {
  return pickStartedAt + clockSeconds * 1000;
}

export function secondsRemaining(
  pickStartedAt: number,
  clockSeconds: number,
  now: number,
): number {
  return Math.max(0, Math.ceil((deadlineMs(pickStartedAt, clockSeconds) - now) / 1000));
}

export function isExpired(
  pickStartedAt: number,
  clockSeconds: number,
  now: number,
): boolean {
  return now >= deadlineMs(pickStartedAt, clockSeconds);
}
