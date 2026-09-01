import Link from 'next/link';
import { getPublishedPosts } from '@/lib/posts';
import { createMetadata } from '@/lib/metadata';
import { formatDate } from '@/lib/date';
import { FOCUS_RING } from '@/lib/styles';

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
      <h1 className="font-medium text-2xl mb-6 tracking-tight">Blog</h1>
      {sortedPosts.length === 0 && (
        <p className="text-gray-500 dark:text-gray-400">No posts yet.</p>
      )}
      <div className="space-y-3">
        {sortedPosts.map(({ slug, entry }) => (
          <Link
            key={slug}
            className={`flex flex-row items-baseline gap-4 group ${FOCUS_RING}`}
            href={`/blog/${slug}`}
          >
            <span className="text-gray-500 dark:text-zinc-400 w-[100px] shrink-0 tabular-nums text-sm">
              {formatDate(entry.publishedAt, 'short')}
            </span>
            <span className="text-gray-900 dark:text-gray-100 tracking-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-150">
              {entry.title}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
