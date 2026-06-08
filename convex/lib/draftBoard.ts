export interface BoardPick {
  membershipId: string;
  playerId: string;
  round: number;
  overall: number;
}

export function buildDraftBoard(
  order: string[],
  rounds: number,
  picks: BoardPick[],
): (BoardPick | null)[][] {
  const grid: (BoardPick | null)[][] = Array.from({ length: rounds }, () =>
    Array.from({ length: order.length }, () => null as BoardPick | null),
  );
  const seatOf = new Map(order.map((id, i) => [id, i]));
  for (const p of picks) {
    const seat = seatOf.get(p.membershipId);
    if (seat === undefined || p.round < 0 || p.round >= rounds) continue;
    grid[p.round][seat] = p;
  }
  return grid;
}
