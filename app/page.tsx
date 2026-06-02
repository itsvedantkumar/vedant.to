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

      <MDX.p>This is my portfolio, blog, and personal website.</MDX.p>

      <MDX.h2>Recent Posts</MDX.h2>
      <MDX.ul>
        {recentPosts.length > 0 ? (
          recentPosts.map(({ slug, entry }) => (
            <MDX.li key={slug}>
              <Link
                href={`/blog/${slug}`}
                className="text-blue-500 hover:text-blue-700 dark:text-gray-400 hover:dark:text-gray-300 dark:underline dark:underline-offset-2 dark:decoration-gray-800"
              >
                {entry.title}
              </Link>
            </MDX.li>
          ))
        ) : (
          <MDX.li>No posts published yet.</MDX.li>
        )}
      </MDX.ul>

      <MDX.h2>Features</MDX.h2>
      <MDX.ul>
        <MDX.li>Visual CMS via Keystatic (editor at /keystatic)</MDX.li>
        <MDX.li>Programmatic SEO &amp; OG Images</MDX.li>
        <MDX.li>Light/dark mode</MDX.li>
        <MDX.li>Deployed on Vercel</MDX.li>
        <MDX.li>Zero UI degradation</MDX.li>
      </MDX.ul>

      <MDX.h2>Stack</MDX.h2>
      <MDX.ul>
        <MDX.li>Next.js / React</MDX.li>
        <MDX.li>Tailwind CSS</MDX.li>
        <MDX.li>Keystatic CMS</MDX.li>
        <MDX.li>Vercel</MDX.li>
      </MDX.ul>
    </section>
  );
}
