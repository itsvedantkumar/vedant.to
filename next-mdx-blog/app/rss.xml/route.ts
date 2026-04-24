import { sanityFetch } from '../../sanity/client';

const SITE_URL = 'https://vedant.to';

export async function GET() {
  const posts = await sanityFetch({
    query: `*[_type == "post"] | order(publishedAt desc) {
      title,
      slug,
      excerpt,
      publishedAt
    }`
  });

  const safePosts = Array.isArray(posts) ? posts : [];

  const rssFeed = `<?xml version="1.0" encoding="UTF-8" ?>
  <rss version="2.0">
    <channel>
        <title>Vedant</title>
        <link>${SITE_URL}</link>
        <description>My portfolio, blog, and personal website.</description>
        ${safePosts
          .map((post: any) => {
            return `
            <item>
              <title>${post.title}</title>
              <link>${SITE_URL}/blog/${post.slug.current}</link>
              <description>${post.excerpt}</description>
              <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>
            </item>
          `;
          })
          .join('')}
    </channel>
  </rss>`;

  return new Response(rssFeed, {
    headers: {
      'Content-Type': 'text/xml',
    },
  });
}
