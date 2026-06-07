import { getPublishedPosts } from './posts';
import { getPublishedDailyEntries } from './daily';

export const FEED_CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400';

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function getPublishedContent() {
  const [posts, daily] = await Promise.all([
    getPublishedPosts(),
    getPublishedDailyEntries(),
  ]);
  return { posts, daily };
}
