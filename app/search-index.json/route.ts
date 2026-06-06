import { readFileSync } from 'fs';
import { join } from 'path';
import { getPublishedPosts } from '@/lib/posts';

// Generated once at build time and served as a static asset. The client search
// box fetches this and filters in-memory — no backend, no extra deps.
export const dynamic = 'force-static';

function plainText(slug: string): string {
  try {
    const raw = readFileSync(
      join(process.cwd(), 'content/posts', `${slug}.mdoc`),
      'utf-8'
    );
    return raw
      .replace(/^---[\s\S]*?---/, '') // frontmatter
      .replace(/\{%[\s\S]*?%\}/g, ' ') // markdoc tags
      .replace(/[#>*_`~\[\]()!-]/g, ' ') // markdown punctuation
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 2000);
  } catch {
    return '';
  }
}

export async function GET() {
  const posts = await getPublishedPosts();

  const index = posts.map(({ slug, entry }) => ({
    slug,
    title: entry.title,
    excerpt: entry.excerpt ?? '',
    date: entry.publishedAt!,
    text: plainText(slug),
  }));

  return Response.json(index, {
    headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
  });
}
