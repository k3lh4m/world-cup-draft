// Pure view helpers for the draft room. Kept dependency-free so they unit-test
// without the Convex runtime and can be imported by client components.

export function sortPicksByOverallDesc<T extends { overall: number }>(picks: T[]): T[] {
  return [...picks].sort((a, b) => b.overall - a.overall);
}

export function isMyTurn(params: {
  status: string;
  currentMembershipId?: string;
  myMembershipId?: string;
}): boolean {
  const { status, currentMembershipId, myMembershipId } = params;
  return (
    status === "active" &&
    !!currentMembershipId &&
    currentMembershipId === myMembershipId
  );
}
