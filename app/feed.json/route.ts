import { FEED_CACHE_CONTROL, getSortedFeedItems } from '@/lib/feed-utils';
import { person } from '@/lib/json-ld';
import { coverImageUrl } from '@/lib/metadata';
import { SITE_URL, SITE_NAME, AUTHOR } from '@/lib/constants';

// JSON Feed 1.1 — https://www.jsonfeed.org/version/1.1/
export const dynamic = 'force-static';

export async function GET() {
  const sortedItems = await getSortedFeedItems();

  const allItems = sortedItems.map((item) => {
    const image = coverImageUrl(item.coverImage);
    return {
      id: item.url,
      url: item.url,
      title: item.title,
      summary: item.excerpt,
      content_text: item.excerpt,
      date_published: item.date.toISOString(),
      ...(item.updatedAt ? { date_modified: item.updatedAt.toISOString() } : {}),
      ...(image ? { image } : {}),
    };
  });

  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: SITE_NAME,
    home_page_url: SITE_URL,
    feed_url: `${SITE_URL}/feed.json`,
    description: 'My portfolio, blog, and personal website.',
    language: 'en-US',
    // JSON Feed 1.1 author shape (name/url/avatar) — not the JSON-LD person,
    // which carries @type/email/sameAs and uses `image` instead of `avatar`.
    authors: [{ name: AUTHOR, url: person.url, avatar: person.image }],
    items: allItems,
  };

  return Response.json(feed, {
    headers: {
      'Content-Type': 'application/feed+json; charset=utf-8',
      'Cache-Control': FEED_CACHE_CONTROL,
    },
  });
}
