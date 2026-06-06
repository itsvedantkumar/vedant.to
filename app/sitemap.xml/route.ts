import { readdirSync } from 'fs';
import { join } from 'path';
import { getPublishedPosts } from '@/lib/posts';

export const dynamic = 'force-static';

const SITE_URL = 'https://vedant.to';

const EXCLUDED = new Set([
  'api',
  'admin',
  'now',
  'keystatic',
  'rss.xml',
  'feed.json',
  'search-index.json',
  '_not-found',
]);

const PAGE_FILE = /^page\.(tsx|ts|jsx|js)$/;
const isRouteGroup = (name: string) => name.startsWith('(') && name.endsWith(')');

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
      if (name.startsWith('_') || name.startsWith('.') || name.startsWith('[')) continue;
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

export async function GET() {
  const posts = await getPublishedPosts();

  const staticRoutes = getStaticRoutes();

  const blogEntries = posts.map(({ slug, entry }) => ({
    url: `${SITE_URL}/blog/${slug}`,
    lastModified: new Date(entry.updatedAt ?? entry.publishedAt!).toISOString(),
  }));

  const all = [...staticRoutes, ...blogEntries];

  function xmlEscape(s: string) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const urls = all
    .map(
      (r) =>
        `  <url>\n    <loc>${xmlEscape(r.url)}</loc>\n    <lastmod>${xmlEscape(r.lastModified)}</lastmod>\n  </url>`
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- why the fuck are you reading this, nerd -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
