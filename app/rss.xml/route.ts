import { reader } from '../../lib/reader';

const SITE_URL = 'https://vedant.to';

export async function GET() {
  const posts = await reader.collections.posts.all();

  const sorted = posts
    .filter((p) => p.entry.publishedAt)
    .sort(
      (a, b) =>
        new Date(b.entry.publishedAt!).getTime() -
        new Date(a.entry.publishedAt!).getTime()
    );

  const rssFeed = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>Vedant</title>
    <link>${SITE_URL}</link>
    <description>My portfolio, blog, and personal website.</description>
    ${sorted
      .map(
        ({ slug, entry }) => `
    <item>
      <title>${entry.title}</title>
      <link>${SITE_URL}/blog/${slug}</link>
      <description>${entry.excerpt ?? ''}</description>
      <pubDate>${new Date(entry.publishedAt!).toUTCString()}</pubDate>
    </item>`
      )
      .join('')}
  </channel>
</rss>`;

  return new Response(rssFeed, {
    headers: { 'Content-Type': 'text/xml' },
  });
}
