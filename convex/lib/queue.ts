export function nextFromQueue(queue: string[], takenIds: Set<string>): string | null {
  for (const id of queue) if (!takenIds.has(id)) return id;
  return null;
}

export function removeFromQueue(queue: string[], id: string): string[] {
  return queue.filter((q) => q !== id);
}

export function chooseAutoPick(
  queue: string[],
  allPlayerIds: string[],
  takenIds: Set<string>,
): string | null {
  const fromQueue = nextFromQueue(queue, takenIds);
  if (fromQueue) return fromQueue;
  for (const id of allPlayerIds) if (!takenIds.has(id)) return id;
  return null;
}
