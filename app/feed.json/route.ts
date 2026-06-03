import { getPublishedPosts } from '@/lib/posts';

const SITE_URL = 'https://vedant.to';

// JSON Feed 1.1 — https://www.jsonfeed.org/version/1.1/
export const dynamic = 'force-static';

export async function GET() {
  const posts = await getPublishedPosts();

  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'Vedant',
    home_page_url: SITE_URL,
    feed_url: `${SITE_URL}/feed.json`,
    description: 'My portfolio, blog, and personal website.',
    language: 'en-US',
    authors: [{ name: 'Vedant Kumar', url: SITE_URL }],
    items: posts.map(({ slug, entry }) => ({
      id: `${SITE_URL}/blog/${slug}`,
      url: `${SITE_URL}/blog/${slug}`,
      title: entry.title,
      summary: entry.excerpt ?? '',
      date_published: new Date(entry.publishedAt!).toISOString(),
      ...(entry.updatedAt
        ? { date_modified: new Date(entry.updatedAt).toISOString() }
        : {}),
      ...(entry.coverImage ? { image: `${SITE_URL}${entry.coverImage}` } : {}),
    })),
  };

  return Response.json(feed, {
    headers: { 'Content-Type': 'application/feed+json; charset=utf-8' },
  });
}
