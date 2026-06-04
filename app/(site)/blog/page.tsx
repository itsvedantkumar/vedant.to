import Link from 'next/link';
import { getPublishedPosts } from '@/lib/posts';
import { createMetadata } from '@/lib/metadata';
import { Search } from '@/components/search';

export const metadata = createMetadata({
  title: 'Blog',
  description:
    'Writing on building products, software engineering, and ideas worth sharing.',
  path: '/blog',
});

export const revalidate = false;

export default async function BlogPage() {
  const sortedPosts = await getPublishedPosts();

  return (
    <div>
      <h1 className="font-semibold text-2xl mb-4 tracking-tighter">Blog</h1>
      <Search />
      {sortedPosts.length === 0 && (
        <p className="text-gray-500 dark:text-gray-400">No posts yet.</p>
      )}
      {sortedPosts.map(({ slug, entry }) => (
        <Link key={slug} className="flex flex-col space-y-1 mb-4" href={`/blog/${slug}`}>
          <div className="w-full flex flex-col md:flex-row space-x-0 md:space-x-2">
            <p className="text-gray-500 dark:text-gray-400 w-[100px] tabular-nums">
              {new Date(entry.publishedAt!).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </p>
            <p className="text-gray-900 dark:text-gray-100 tracking-tight">
              {entry.title}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
