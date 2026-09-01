import { getPublishedPosts } from './posts';
import { getPublishedDailyEntries } from './daily';
import { formatDate } from './date';
import { SITE_URL } from './constants';

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

// The shared surface across rss.xml and feed.json: which entries are
// published, how post + daily items merge, and the date they sort by.
// Serialization (XML vs JSON Feed shape) stays in each route — they are
// not the same format and shouldn't be forced to look like one.
export type FeedItem = {
  title: string;
  url: string;
  excerpt: string;
  date: Date;
  updatedAt?: Date;
  coverImage?: string | null;
};

export async function getSortedFeedItems(): Promise<FeedItem[]> {
  const { posts, daily } = await getPublishedContent();

  const postItems: FeedItem[] = posts.map(({ slug, entry }) => ({
    title: entry.title,
    url: `${SITE_URL}/blog/${slug}`,
    excerpt: entry.excerpt ?? '',
    date: new Date(entry.publishedAt),
    updatedAt: entry.updatedAt ? new Date(entry.updatedAt) : undefined,
    coverImage: entry.coverImage,
  }));

  const dailyItems: FeedItem[] = daily.map(({ slug, entry }) => ({
    title: formatDate(entry.date, 'long'),
    url: `${SITE_URL}/daily/${slug}`,
    excerpt: '',
    date: new Date(entry.date),
  }));

  return [...postItems, ...dailyItems].sort(
    (a, b) => b.date.getTime() - a.date.getTime()
  );
}
