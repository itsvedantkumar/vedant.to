import { FEED_CACHE_CONTROL, getPublishedContent } from '@/lib/feed-utils';
import { person } from '@/lib/json-ld';
import { coverImageUrl } from '@/lib/metadata';
import { formatDate } from '@/lib/date';
import { SITE_URL } from '@/lib/constants';

// JSON Feed 1.1 — https://www.jsonfeed.org/version/1.1/
export const dynamic = 'force-static';

export async function GET() {
  const { posts, daily } = await getPublishedContent();

  const postItems = posts.map(({ slug, entry }) => {
    const image = coverImageUrl(entry.coverImage);
    return {
      id: `${SITE_URL}/blog/${slug}`,
      url: `${SITE_URL}/blog/${slug}`,
      title: entry.title,
      summary: entry.excerpt ?? '',
      date_published: new Date(entry.publishedAt!).toISOString(),
      ...(entry.updatedAt
        ? { date_modified: new Date(entry.updatedAt).toISOString() }
        : {}),
      ...(image ? { image } : {}),
    };
  });

  const dailyItems = daily.map(({ slug, entry }) => ({
    id: `${SITE_URL}/daily/${slug}`,
    url: `${SITE_URL}/daily/${slug}`,
    title: formatDate(entry.date!, 'long'),
    summary: '',
    date_published: new Date(entry.date!).toISOString(),
  }));

  const allItems = [...postItems, ...dailyItems].sort(
    (a, b) => new Date(b.date_published).getTime() - new Date(a.date_published).getTime()
  );

  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'Vedant',
    home_page_url: SITE_URL,
    feed_url: `${SITE_URL}/feed.json`,
    description: 'My portfolio, blog, and personal website.',
    language: 'en-US',
    authors: [person],
    items: allItems,
  };

  return Response.json(feed, {
    headers: {
      'Content-Type': 'application/feed+json; charset=utf-8',
      'Cache-Control': FEED_CACHE_CONTROL,
    },
  });
}
