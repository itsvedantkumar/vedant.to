import { useMDXComponents } from '../mdx-components';

export default function Home() {
  const MDX = useMDXComponents();

  return (
    <article className="prose prose-invert">
      <MDX.h1>Vedant</MDX.h1>
      <br />
      <MDX.p>This is my portfolio, blog, and personal website.</MDX.p>

      <MDX.h2>Examples</MDX.h2>
      <MDX.ul>
        <MDX.li><MDX.a href="/blog/5-tiny-cli-tricks">5 Tiny CLI Tricks You (Probably) Didn’t Know</MDX.a></MDX.li>
        <MDX.li><MDX.a href="/blog/6-sneaky-javascript-patterns">6 Sneaky JavaScript Patterns to Cut Boilerplate</MDX.a></MDX.li>
        <MDX.li><MDX.a href="/blog/6-css-patterns">6 CSS Patterns to Cut Boilerplate</MDX.a></MDX.li>
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
