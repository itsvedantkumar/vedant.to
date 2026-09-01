import { FEED_CACHE_CONTROL, escapeXml, getSortedFeedItems } from '@/lib/feed-utils';
import { SITE_URL } from '@/lib/constants';

// Next 15 and later no longer statically cache GET route handlers by default; the feed
// is build-time content, so opt back into static generation.
export const dynamic = 'force-static';

export async function GET() {
  const allItems = await getSortedFeedItems();

  const lastBuildDate = allItems[0]?.date.toUTCString() ?? new Date().toUTCString();

  const rssFeed = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Vedant</title>
    <link>${SITE_URL}</link>
    <description>My portfolio, blog, and personal website.</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />
    ${allItems
      .map(
        (item) => `
    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.url)}</link>
      <guid isPermaLink="true">${escapeXml(item.url)}</guid>
      <description>${escapeXml(item.excerpt)}</description>
      <pubDate>${item.date.toUTCString()}</pubDate>
    </item>`
      )
      .join('')}
  </channel>
</rss>`;

  return new Response(rssFeed, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': FEED_CACHE_CONTROL,
    },
  });
}
