import { Suspense } from 'react';
import { useMDXComponents } from '../mdx-components';
import { client } from '../sanity/client';
import { MascotWrapper } from './components/MascotWrapper';
import Link from 'next/link';

export const revalidate = 60; // revalidate at most every minute

export default async function Home() {
  const MDX = useMDXComponents();

  let recentPosts = [];
  try {
    const posts = await client.fetch(
      `*[_type == "post"] | order(publishedAt desc)[0...3] { title, slug }`
    );
    recentPosts = Array.isArray(posts) ? posts : [];
  } catch (err) {
    console.error(err);
  }

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
          recentPosts.map((post: any) => (
            <MDX.li key={post.slug.current}>
              <Link href={`/blog/${post.slug.current}`} className="text-blue-500 hover:text-blue-700 dark:text-gray-400 hover:dark:text-gray-300 dark:underline dark:underline-offset-2 dark:decoration-gray-800">{post.title}</Link>
            </MDX.li>
          ))
        ) : (
          <MDX.li>No posts published yet.</MDX.li>
        )}
      </MDX.ul>

      <MDX.h2>Features</MDX.h2>
      <MDX.ul>
        <MDX.li>Full Headless CMS via Sanity.io</MDX.li>
        <MDX.li>Programmatic SEO & OG Images</MDX.li>
        <MDX.li>Automated Daily Backups</MDX.li>
        <MDX.li>Light/dark mode</MDX.li>
        <MDX.li>Edge-cached via Cloudflare</MDX.li>
        <MDX.li>Zero UI degradation</MDX.li>
      </MDX.ul>

      <MDX.h2>Stack</MDX.h2>
      <MDX.ul>
        <MDX.li>Next.js / React</MDX.li>
        <MDX.li>Tailwind CSS</MDX.li>
        <MDX.li>Sanity CMS</MDX.li>
        <MDX.li>Vercel / Cloudflare</MDX.li>
      </MDX.ul>
    </section>
  );
}
