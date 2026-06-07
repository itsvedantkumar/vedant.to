import { reader } from './reader';

export async function getPublishedDailyEntries() {
  const entries = await reader.collections.daily.all();
  return entries
    .filter((e) => e.entry.date && !e.entry.draft)
    .sort(
      (a, b) =>
        (new Date(b.entry.date!).getTime() || 0) -
        (new Date(a.entry.date!).getTime() || 0)
    );
}
