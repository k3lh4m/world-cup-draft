export type DatedPoints = { date: string; points: number };

export function groupByDate(rows: DatedPoints[]): DatedPoints[] {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.date, (map.get(r.date) ?? 0) + r.points);
  return [...map.entries()]
    .map(([date, points]) => ({ date, points }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
