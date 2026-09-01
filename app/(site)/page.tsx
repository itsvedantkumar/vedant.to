import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_NAME } from '@/lib/constants';
import { getPublishedPosts } from '@/lib/posts';
import { createMetadata, ogImageUrl } from '@/lib/metadata';
import { formatDate } from '@/lib/date';

export const metadata: Metadata = {
  ...createMetadata({
    title: SITE_NAME,
    description:
      "I'm a contrarian chasing polymathy. I love watching movies, listening to music, and absorbing culture. I plan to dedicate my life to advancing human civilisation.",
    path: '/',
    image: ogImageUrl(SITE_NAME),
  }),
  // absolute bypasses the '%s — Vedant' template so homepage doesn't become 'Vedant — Vedant'
  title: { absolute: SITE_NAME },
};

export const revalidate = false;

export default async function Home() {
  const recentPosts = (await getPublishedPosts()).slice(0, 3);

  return (
    <section className="space-y-8">
      <div>
        <h1 className="font-medium text-2xl tracking-tight mb-2">Vedant</h1>
        <p className="text-gray-600 dark:text-zinc-400">
          I&apos;m a contrarian chasing polymathy
        </p>
        <p className="text-gray-600 dark:text-zinc-400 mt-1">
          I love watching movies, listening to music, and absorbing culture
        </p>
        <p className="text-gray-600 dark:text-zinc-400 mt-1">
          Other than that, I plan to dedicate my life to advancing human civilisation
        </p>
      </div>

      <div>
        <h2 className="font-medium text-gray-800 dark:text-zinc-200 mb-4">
          Recent Posts
        </h2>
        {recentPosts.length > 0 ? (
          <div className="space-y-3">
            {recentPosts.map(({ slug, entry }) => (
              <Link
                key={slug}
                href={`/blog/${slug}`}
                className="flex flex-row items-baseline gap-4 group"
              >
                <span className="text-gray-500 dark:text-zinc-400 tabular-nums text-sm w-[100px] shrink-0">
                  {formatDate(entry.publishedAt!, 'short')}
                </span>
                <span className="text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-150">
                  {entry.title}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 dark:text-gray-400">No posts yet.</p>
        )}
        <Link
          href="/blog"
          className="inline-block mt-4 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors duration-150"
        >
          All posts →
        </Link>
      </div>
    </section>
  );
}
