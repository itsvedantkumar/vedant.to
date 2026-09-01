import { readdirSync } from 'fs';
import { join } from 'path';
import { FEED_CACHE_CONTROL, escapeXml, getPublishedContent } from '@/lib/feed-utils';
import { SITE_URL } from '@/lib/constants';

export const dynamic = 'force-static';

// 'keystatic' covers both /keystatic and /auth/keystatic — matched at any depth.
const EXCLUDED = new Set([
  'api',
  'admin',
  'keystatic',
  'rss.xml',
  'feed.json',
  'whisper',
  '_not-found',
]);

const PAGE_FILE = /^page\.(tsx|ts|jsx|js)$/;
const isRouteGroup = (name: string) => name.startsWith('(') && name.endsWith(')');

function getStaticRoutes(): string[] {
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

  return [...routes];
}

export async function GET() {
  const { posts, daily: dailyEntries } = await getPublishedContent();

  const blogEntries = posts.map(({ slug, entry }) => ({
    url: `${SITE_URL}/blog/${slug}`,
    lastModified: new Date(entry.updatedAt ?? entry.publishedAt).toISOString(),
  }));

  const dailySitemapEntries = dailyEntries.map(({ slug, entry }) => ({
    url: `${SITE_URL}/daily/${slug}`,
    lastModified: new Date(entry.date).toISOString(),
  }));

  // Static routes get content-derived lastModified; routes with no honest date
  // (e.g. /quotes — no date field in the collection) omit <lastmod> instead of
  // claiming a change on every deploy. ISO strings compare lexicographically.
  const newest = (dates: string[]) =>
    dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : undefined;
  const newestPost = newest(blogEntries.map((e) => e.lastModified));
  const newestDaily = newest(dailySitemapEntries.map((e) => e.lastModified));
  const newestAny = newest(
    [newestPost, newestDaily].filter((d): d is string => d !== undefined)
  );

  const staticLastModified: Record<string, string | undefined> = {
    '/': newestAny,
    '/blog': newestPost,
    '/daily': newestDaily,
  };

  const staticRoutes: { url: string; lastModified?: string }[] = getStaticRoutes().map(
    (route) => ({
      url: `${SITE_URL}${route === '/' ? '' : route}`,
      lastModified: staticLastModified[route],
    })
  );

  const all = [...staticRoutes, ...blogEntries, ...dailySitemapEntries];

  const urls = all
    .map((r) => {
      const lastmod = r.lastModified
        ? `\n    <lastmod>${escapeXml(r.lastModified)}</lastmod>`
        : '';
      return `  <url>\n    <loc>${escapeXml(r.url)}</loc>${lastmod}\n  </url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- why the fuck are you reading this, nerd -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': FEED_CACHE_CONTROL,
    },
  });
}
