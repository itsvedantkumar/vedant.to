import Link from 'next/link';
import { reader } from '@/lib/reader';

export const revalidate = false;

export default async function Home() {
  const allPosts = await reader.collections.posts.all();
  const recentPosts = allPosts
    .filter((p) => p.entry.publishedAt)
    .sort(
      (a, b) =>
        new Date(b.entry.publishedAt!).getTime() -
        new Date(a.entry.publishedAt!).getTime()
    )
    .slice(0, 3);

  return (
    <section className="space-y-8">
      <div>
        <h1 className="font-medium text-2xl tracking-tight mb-2">Vedant</h1>
        <p className="text-gray-600 dark:text-zinc-400">
          I love watching movies, listening to music, and absorbing culture + working my ass off
        </p>
        <p className="text-gray-600 dark:text-zinc-400 mt-1">
          My greatest fear in life is being mediocre
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
                className="flex flex-col md:flex-row md:items-center md:gap-4 group"
              >
                <span className="text-gray-400 dark:text-gray-500 tabular-nums text-sm w-[100px] shrink-0">
                  {new Date(entry.publishedAt!).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <span className="text-gray-900 dark:text-gray-100 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors duration-150">
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
          className="inline-block mt-4 text-sm text-blue-500 hover:text-blue-600 transition-colors duration-150"
        >
          All posts →
        </Link>
      </div>
    </section>
  );
}
