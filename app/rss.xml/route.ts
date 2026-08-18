import { FEED_CACHE_CONTROL, escapeXml, getPublishedContent } from '@/lib/feed-utils';
import { formatDate } from '@/lib/date';
import { SITE_URL } from '@/lib/constants';

// Next 15 no longer statically caches GET route handlers by default; the feed
// is build-time content, so opt back into static generation.
export const dynamic = 'force-static';

export async function GET() {
  const { posts, daily } = await getPublishedContent();

  const postItems = posts.map(({ slug, entry }) => ({
    title: entry.title,
    link: `${SITE_URL}/blog/${slug}`,
    description: entry.excerpt ?? '',
    pubDate: new Date(entry.publishedAt!).toUTCString(),
  }));

  const dailyItems = daily.map(({ slug, entry }) => ({
    title: formatDate(entry.date!, 'long'),
    link: `${SITE_URL}/daily/${slug}`,
    description: '',
    pubDate: new Date(entry.date!).toUTCString(),
  }));

  const allItems = [...postItems, ...dailyItems].sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
  );

  const lastBuildDate = allItems[0]?.pubDate ?? new Date().toUTCString();

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
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="true">${escapeXml(item.link)}</guid>
      <description>${escapeXml(item.description)}</description>
      <pubDate>${item.pubDate}</pubDate>
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
