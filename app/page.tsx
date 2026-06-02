import { Suspense } from 'react';
import Link from 'next/link';
import { useMDXComponents } from '../mdx-components';
import { MascotWrapper } from './components/MascotWrapper';
import { reader } from '../lib/reader';

export const revalidate = false;

export default async function Home() {
  const MDX = useMDXComponents();

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
    <section>
      <div className="w-full flex flex-col items-start justify-start cursor-default -mb-4">
        <MDX.h1>Vedant</MDX.h1>
        <Suspense fallback={<div className="h-[65px]" />}>
          <MascotWrapper />
        </Suspense>
      </div>

      <MDX.p>
        This is my portfolio, blog, and personal website — a place where I
        write about the things I build and the ideas I'm chewing on.
      </MDX.p>

      <MDX.h2>Recent Posts</MDX.h2>
      {recentPosts.length > 0 ? (
        <div className="space-y-1">
          {recentPosts.map(({ slug, entry }) => (
            <Link
              key={slug}
              href={`/blog/${slug}`}
              className="flex flex-col space-y-1 mb-3 transition-opacity duration-200 hover:opacity-80"
            >
              <div className="w-full flex flex-col md:flex-row md:items-center md:space-x-3">
                <p className="text-gray-500 dark:text-gray-400 w-[110px] tabular-nums text-sm shrink-0">
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
      ) : (
        <MDX.p>No posts published yet.</MDX.p>
      )}

      <MDX.p>
        <Link
          href="/blog"
          className="text-blue-500 hover:text-blue-600 transition-colors duration-200"
        >
          View all posts →
        </Link>
      </MDX.p>
    </section>
  );
}
