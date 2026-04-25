'use client';

import { useEffect, useRef, useState } from 'react';
import { useMDXComponents } from '../mdx-components';
import { client } from '../sanity/client';
import { Mascot, MascotRef } from './components/Mascot';

export default function Home() {
  const MDX = useMDXComponents();
  const mascotRef = useRef<MascotRef>(null);

  const [recentPosts, setRecentPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPosts() {
      mascotRef.current?.setState('thinking');
      try {
        const posts = await client.fetch(
          `*[_type == "post"] | order(publishedAt desc)[0...3] { title, slug }`
        );
        setRecentPosts(Array.isArray(posts) ? posts : []);
        mascotRef.current?.setState('success');
      } catch (err) {
        console.error(err);
        mascotRef.current?.setState('error');
      } finally {
        setLoading(false);
      }
    }
    fetchPosts();
  }, []);

  return (
    <article className="prose prose-invert relative flex flex-col">
      <div
        className="w-full flex flex-col items-start justify-start cursor-default"
        onMouseEnter={() => mascotRef.current?.setState('playing')}
      >
        <MDX.h1>Vedant</MDX.h1>
        <Mascot ref={mascotRef} />
      </div>

      <MDX.p>This is my portfolio, blog, and personal website.</MDX.p>

      <MDX.h2>Recent Posts</MDX.h2>
      <MDX.ul>
        {loading ? (
          <MDX.li>Loading latest thoughts...</MDX.li>
        ) : recentPosts.length > 0 ? (
          recentPosts.map((post: any) => (
            <MDX.li key={post.slug.current}>
              <MDX.a href={`/blog/${post.slug.current}`}>{post.title}</MDX.a>
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
    </article>
  );
}
