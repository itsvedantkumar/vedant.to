import { reader } from './reader';
import { docToExcerpt } from '@/lib/excerpt';

export async function getPublishedDailyEntries() {
  const entries = await reader.collections.daily.all();
  return entries
    .filter((e) => e.entry.date && !e.entry.draft)
    .sort(
      (a, b) =>
        (new Date(b.entry.date).getTime() || 0) - (new Date(a.entry.date).getTime() || 0)
    );
}

export async function getRecentDailyEntries(limit = 3) {
  const entries = (await getPublishedDailyEntries()).slice(0, limit);
  return Promise.all(
    entries.map(async ({ slug, entry }) => ({
      slug,
      entry,
      excerpt: docToExcerpt(await entry.content()),
    }))
  );
}
