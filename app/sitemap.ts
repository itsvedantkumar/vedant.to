import { reader } from '../lib/reader';

const SITE_URL = 'https://vedant.to';

export default async function sitemap() {
  const posts = await reader.collections.posts.all();

  const blogPosts = posts
    .filter((p) => p.entry.publishedAt)
    .map(({ slug, entry }) => ({
      url: `${SITE_URL}/blog/${slug}`,
      lastModified: new Date(entry.publishedAt!).toISOString(),
    }));

  const staticRoutes = [
    { route: '', lastModified: '2026-06-02' },
    { route: '/blog', lastModified: '2026-06-02' },
  ].map(({ route, lastModified }) => ({
    url: `${SITE_URL}${route}`,
    lastModified,
  }));

  return [...staticRoutes, ...blogPosts];
}
