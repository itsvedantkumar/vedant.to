import { readdirSync } from 'fs';
import { join } from 'path';
import { getPublishedPosts } from '../lib/posts';

const SITE_URL = 'https://vedant.to';

// Dir names that never map to a public, indexable page.
const EXCLUDED = new Set([
  'api',
  'keystatic',
  'rss.xml',
  'feed.json',
  'search-index.json',
  '_not-found',
]);

const PAGE_FILE = /^page\.(tsx|ts|jsx|js)$/;
const isRouteGroup = (name: string) => name.startsWith('(') && name.endsWith(')');

// Walk app/ for page files. Route groups like (site) contribute no URL segment,
// dynamic [slug] segments are skipped (handled from content), so /blog and /now
// nested inside (site) are discovered correctly.
function getStaticRoutes(): { url: string; lastModified: string }[] {
  const appDir = join(process.cwd(), 'app');
  const routes = new Set<string>();

  function walk(dir: string, segments: string[]) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    if (entries.some((e) => e.isFile() && PAGE_FILE.test(e.name))) {
      routes.add('/' + segments.join('/'));
    }

    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const name = e.name;
      if (name.startsWith('_') || name.startsWith('.') || name.startsWith('[')) {
        continue;
      }
      if (EXCLUDED.has(name)) continue;
      walk(join(dir, name), isRouteGroup(name) ? segments : [...segments, name]);
    }
  }

  walk(appDir, []);

  return [...routes].map((route) => ({
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
