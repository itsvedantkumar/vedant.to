import { notFound } from 'next/navigation';
import { DocumentRenderer } from '@keystatic/core/renderer';
import { reader } from '@/lib/reader';
import { renderers } from '@/lib/renderers';
import { createMetadata } from '@/lib/metadata';
import { getReadingTime } from '@/lib/reading-time';

export const revalidate = false;

export async function generateStaticParams() {
  const slugs = await reader.collections.posts.list();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await reader.collections.posts.read(slug);

  if (!post || !post.publishedAt) return {};

  return createMetadata({
    title: post.title,
    description: post.excerpt ?? post.title,
    path: `/blog/${slug}`,
    publishedAt: post.publishedAt,
  });
}

export default async function BlogPost({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await reader.collections.posts.read(slug);

  if (!post || !post.publishedAt) notFound();

  const content = await post.content();

  const mins = getReadingTime(slug);

  return (
    <section>
      <h1 className="font-medium pt-12 mb-0">{post.title}</h1>
      <div className="flex items-center gap-3 mt-2 mb-8 text-sm text-neutral-500 dark:text-neutral-400">
        {post.publishedAt && (
          <span>
            {new Date(post.publishedAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </span>
        )}
        <span aria-hidden>·</span>
        <span>{mins} min read</span>
      </div>
      <article>
        {/* renderers cast needed: our renderer map is a superset of the core type */}
        <DocumentRenderer document={content} renderers={renderers as unknown as Parameters<typeof DocumentRenderer>[0]['renderers']} />
      </article>
    </section>
  );
}
