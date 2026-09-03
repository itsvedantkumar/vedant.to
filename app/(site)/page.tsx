import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_NAME } from '@/lib/constants';
import { getPublishedPosts } from '@/lib/posts';
import { getRecentDailyEntries } from '@/lib/daily';
import { createMetadata, ogImageUrl } from '@/lib/metadata';
import { formatDate } from '@/lib/date';
import { FOCUS_RING } from '@/lib/styles';

export const metadata: Metadata = {
  ...createMetadata({
    title: SITE_NAME,
    description: 'I love watching movies, listening to music, and absorbing culture.',
    path: '/',
    image: ogImageUrl(SITE_NAME),
  }),
  // absolute bypasses the '%s — Vedant' template so homepage doesn't become 'Vedant — Vedant'
  title: { absolute: SITE_NAME },
};

export const revalidate = false;

export default async function Home() {
  const [recentPosts, recentDaily] = await Promise.all([
    getPublishedPosts().then((p) => p.slice(0, 3)),
    getRecentDailyEntries(3),
  ]);

  return (
    <section className="space-y-8">
      <div>
        <h1 className="font-medium text-2xl tracking-tight mb-2">Vedant</h1>
        <p className="text-gray-600 dark:text-zinc-400">
          I love watching movies, listening to music, and absorbing culture
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
                className={`flex flex-row items-baseline gap-4 group ${FOCUS_RING}`}
              >
                <span className="text-gray-500 dark:text-zinc-400 tabular-nums text-sm w-[100px] shrink-0">
                  {formatDate(entry.publishedAt, 'short')}
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
          className={`inline-block mt-4 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors duration-150 ${FOCUS_RING}`}
        >
          All posts →
        </Link>
      </div>

      <div>
        <h2 className="font-medium text-gray-800 dark:text-zinc-200 mb-4">Daily Diary</h2>
        {recentDaily.length > 0 ? (
          <div className="space-y-3">
            {recentDaily.map(({ slug, entry, excerpt }) => (
              <Link
                key={slug}
                href={`/daily/${slug}`}
                className={`flex flex-row items-baseline gap-4 group ${FOCUS_RING}`}
              >
                <span className="text-gray-500 dark:text-zinc-400 tabular-nums text-sm w-[100px] shrink-0">
                  {formatDate(entry.date, 'short')}
                </span>
                <span className="text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-150 truncate min-w-0">
                  {excerpt || formatDate(entry.date, 'long')}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 dark:text-gray-400">No entries yet.</p>
        )}
        <Link
          href="/daily"
          className={`inline-block mt-4 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors duration-150 ${FOCUS_RING}`}
        >
          All entries →
        </Link>
      </div>
    </section>
  );
}
