import { reader } from './reader';

// Single source of truth for "what's live": published, not a draft, sorted
// newest-first. Every listing (home, blog, RSS, JSON feed, sitemap, search)
// goes through this so draft/unpublished posts can never leak.
export async function getPublishedPosts() {
  const posts = await reader.collections.posts.all();
  return posts
    .filter((p) => p.entry.publishedAt && !p.entry.draft)
    .sort(
      (a, b) =>
        (new Date(b.entry.publishedAt!).getTime() || 0) -
        (new Date(a.entry.publishedAt!).getTime() || 0)
    );
}
