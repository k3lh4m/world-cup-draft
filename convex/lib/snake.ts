export function membershipForPick<T>(order: T[], overall: number): T {
  const n = order.length;
  const round = Math.floor(overall / n);
  const idxInRound = overall % n;
  const pos = round % 2 === 0 ? idxInRound : n - 1 - idxInRound;
  return order[pos];
}

export function isDraftComplete(
  teams: number,
  rosterSize: number,
  overallNextPick: number,
): boolean {
  return overallNextPick >= teams * rosterSize;
}
