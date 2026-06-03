import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { getPublishedPosts } from '../lib/posts';

const SITE_URL = 'https://vedant.to';

// Dirs to exclude from auto-discovery
const EXCLUDED = new Set([
  'api',
  'keystatic',
  'rss.xml',
  'feed.json',
  'search-index.json',
  '_not-found',
]);

function getStaticRoutes(): { url: string; lastModified: string }[] {
  const appDir = join(process.cwd(), 'app');
  const routes: string[] = ['/'];

  try {
    for (const entry of readdirSync(appDir)) {
      if (
        entry.startsWith('_') ||
        entry.startsWith('.') ||
        entry.startsWith('[') ||
        EXCLUDED.has(entry)
      )
        continue;

      const fullPath = join(appDir, entry);
      if (!statSync(fullPath).isDirectory()) continue;

      try {
        statSync(join(fullPath, 'page.tsx'));
        routes.push(`/${entry}`);
      } catch {
        // no page.tsx — not a routable page
      }
    }
  } catch {
    // fallback: at minimum serve the root
  }

  return routes.map((route) => ({
    url: `${SITE_URL}${route === '/' ? '' : route}`,
    lastModified: new Date().toISOString().split('T')[0],
  }));
}

export default async function sitemap() {
  const posts = await getPublishedPosts();

  const blogPosts = posts.map(({ slug, entry }) => ({
    url: `${SITE_URL}/blog/${slug}`,
    lastModified: new Date(entry.updatedAt ?? entry.publishedAt!).toISOString(),
  }));

  return [...getStaticRoutes(), ...blogPosts];
}
