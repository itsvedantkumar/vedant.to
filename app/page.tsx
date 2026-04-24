import { useMDXComponents } from '../mdx-components';
import { sanityFetch } from '../sanity/client';

export default async function Home() {
  const MDX = useMDXComponents();

  const posts = await sanityFetch({
    query: `*[_type == "post"] | order(publishedAt desc)[0...3] {
      title,
      slug
    }`
  });

  const recentPosts = Array.isArray(posts) ? posts : [];

  return (
    <article className="prose prose-invert">
      <MDX.h1>Vedant</MDX.h1>
      <br />
      <MDX.p>This is my portfolio, blog, and personal website.</MDX.p>

      <MDX.h2>Recent Posts</MDX.h2>
      <MDX.ul>
        {recentPosts.length > 0 ? (
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
