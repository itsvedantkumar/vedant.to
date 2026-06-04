import { getPublishedPosts } from '../../lib/posts';

// Next 15 no longer statically caches GET route handlers by default; the feed
// is build-time content, so opt back into static generation.
export const dynamic = 'force-static';

const SITE_URL = 'https://vedant.to';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET() {
  const sorted = await getPublishedPosts();

  const lastBuildDate = sorted[0]
    ? new Date(sorted[0].entry.publishedAt!).toUTCString()
    : new Date().toUTCString();

  const rssFeed = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Vedant</title>
    <link>${SITE_URL}</link>
    <description>My portfolio, blog, and personal website.</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />
    ${sorted
      .map(
        ({ slug, entry }) => `
    <item>
      <title>${escapeXml(entry.title)}</title>
      <link>${SITE_URL}/blog/${slug}</link>
      <guid isPermaLink="true">${SITE_URL}/blog/${slug}</guid>
      <description>${escapeXml(entry.excerpt ?? '')}</description>
      <pubDate>${new Date(entry.publishedAt!).toUTCString()}</pubDate>
    </item>`
      )
      .join('')}
  </channel>
</rss>`;

  return new Response(rssFeed, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
