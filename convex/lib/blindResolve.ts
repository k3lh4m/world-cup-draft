export interface BlindSelection {
  membershipId: string;
  playerIds: string[];
}

export interface ResolveResult {
  assignments: { membershipId: string; playerId: string }[];
  wiped: string[];
}

/**
 * Pure round resolution. Counts each player across managers (deduped within a
 * single manager). count === 1 → assigned to that manager; count >= 2 → wiped.
 */
export function resolveRound(selections: BlindSelection[]): ResolveResult {
  const count = new Map<string, number>();
  const owner = new Map<string, string>();
  for (const sel of selections) {
    for (const playerId of new Set(sel.playerIds)) {
      count.set(playerId, (count.get(playerId) ?? 0) + 1);
      owner.set(playerId, sel.membershipId);
    }
  }
  const assignments: { membershipId: string; playerId: string }[] = [];
  const wiped: string[] = [];
  for (const [playerId, c] of count) {
    if (c === 1) assignments.push({ membershipId: owner.get(playerId)!, playerId });
    else wiped.push(playerId);
  }
  return { assignments, wiped };
}
