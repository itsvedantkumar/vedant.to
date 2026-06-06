import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DocumentRenderer } from '@keystatic/core/renderer';
import { reader } from '@/lib/reader';
import { getPublishedPosts } from '@/lib/posts';
import { renderers } from '@/lib/renderers';
import { createMetadata } from '@/lib/metadata';
import { getReadingStats } from '@/lib/reading-time';
import { articleSchema } from '@/lib/json-ld';
import { normalizeDoc } from '@/lib/normalize-doc';
import { PostConsoleArt } from '@/components/post-console-art';

const SITE_URL = 'https://vedant.to';

export const revalidate = false;

export async function generateStaticParams() {
  const posts = await getPublishedPosts();
  return posts.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await reader.collections.posts.read(slug);

  if (!post || !post.publishedAt || post.draft) return {};

  return createMetadata({
    title: post.title,
    description: post.excerpt ?? post.title,
    path: `/blog/${slug}`,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
    image: post.coverImage
      ? post.coverImage.startsWith('http')
        ? post.coverImage
        : `${SITE_URL}${post.coverImage}`
      : undefined,
  });
}

export default async function BlogPost({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await reader.collections.posts.read(slug);

  if (!post || !post.publishedAt || post.draft) notFound();

  const raw = await post.content();
  const content = normalizeDoc(raw);
  const { words, minutes } = getReadingStats(slug);

  // Adjacent posts for prev/next navigation (newest-first ordering).
  const all = await getPublishedPosts();
  const idx = all.findIndex((p) => p.slug === slug);
  const newer = idx > 0 ? all[idx - 1] : null;
  const older = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;

  const schema = articleSchema({
    title: post.title,
    description: post.excerpt ?? post.title,
    slug,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
    image: post.coverImage
      ? post.coverImage.startsWith('http')
        ? post.coverImage
        : `${SITE_URL}${post.coverImage}`
      : undefined,
    wordCount: words,
    minutes,
  });

  return (
    <section>
      <PostConsoleArt slug={slug} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <h1 className="text-2xl font-medium tracking-tight mb-0">{post.title}</h1>
      <div className="flex items-center gap-3 mt-2 mb-8 text-sm text-neutral-500 dark:text-neutral-400">
        <span>
          {new Date(post.publishedAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </span>
        <span aria-hidden>·</span>
        <span>{minutes} min read</span>
      </div>
      {post.coverImage && (
        <Image
          src={post.coverImage}
          alt={post.title}
          width={1200}
          height={675}
          priority
          className="w-full aspect-video object-cover rounded-xl mb-10"
        />
      )}
      <article>
        {/* renderers cast needed: our renderer map is a superset of the core type */}
        <DocumentRenderer
          document={content}
          renderers={
            renderers as unknown as Parameters<typeof DocumentRenderer>[0]['renderers']
          }
        />
      </article>

      {(newer || older) && (
        <nav className="mt-16 flex justify-between gap-4 border-t border-gray-100 pt-6 text-sm dark:border-zinc-800">
          {older ? (
            <Link
              href={`/blog/${older.slug}`}
              className="group max-w-[45%] text-gray-500 hover:text-blue-500 dark:text-gray-400"
            >
              <span className="block text-xs text-gray-400 dark:text-gray-600">
                ← Older
              </span>
              <span className="text-gray-900 dark:text-gray-100">
                {older.entry.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {newer ? (
            <Link
              href={`/blog/${newer.slug}`}
              className="group max-w-[45%] text-right text-gray-500 hover:text-blue-500 dark:text-gray-400"
            >
              <span className="block text-xs text-gray-400 dark:text-gray-600">
                Newer →
              </span>
              <span className="text-gray-900 dark:text-gray-100">
                {newer.entry.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  );
}
