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

  const staticRoutes = ['', '/blog'].map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: new Date().toISOString(),
  }));

  return [...staticRoutes, ...blogPosts];
}
