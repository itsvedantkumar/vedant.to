import { notFound } from 'next/navigation';
import { DocumentRenderer } from '@keystatic/core/renderer';
import { reader } from '../../../lib/reader';
import { renderers } from '../../../lib/renderers';

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

  if (!post) return {};

  return {
    title: post.title,
    description: post.excerpt ?? undefined,
    openGraph: {
      title: post.title,
      description: post.excerpt ?? undefined,
      type: 'article',
      publishedTime: post.publishedAt ?? undefined,
      url: `https://vedant.to/blog/${slug}`,
      images: [
        {
          url: `https://vedant.to/api/og?title=${encodeURIComponent(post.title)}`,
        },
      ],
    },
  };
}

export default async function BlogPost({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await reader.collections.posts.read(slug);

  if (!post) notFound();

  const content = await post.content();

  return (
    <section>
      <h1 className="font-medium pt-12 mb-0">{post.title}</h1>
      <div className="flex justify-between items-center mt-2 mb-8 text-sm">
        {post.publishedAt && (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {new Date(post.publishedAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        )}
      </div>
      <article>
        <DocumentRenderer document={content} renderers={renderers as any} />
      </article>
    </section>
  );
}
