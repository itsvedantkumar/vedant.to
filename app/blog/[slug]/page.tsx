import { notFound } from 'next/navigation';
import { PortableText } from '@portabletext/react';
import { sanityFetch, urlFor } from '../../../sanity/client';
import { useMDXComponents } from '../../../mdx-components';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const post = await sanityFetch({
    query: `*[_type == "post" && slug.current == $slug][0]`,
    params: { slug: resolvedParams.slug }
  });

  if (!post) {
    return {};
  }

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: 'article',
      publishedTime: post.publishedAt,
      url: `https://vedant.to/blog/${post.slug.current}`,
      images: [
        {
          url: `https://vedant.to/api/og?title=${encodeURIComponent(post.title)}`
        }
      ]
    }
  };
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const post = await sanityFetch({
    query: `*[_type == "post" && slug.current == $slug][0]`,
    params: { slug: resolvedParams.slug }
  });

  if (!post) {
    notFound();
  }

  const mdxComponents = useMDXComponents();

  const ptComponents = {
    types: {
      image: ({ value }: any) => {
        if (!value?.asset?._ref) {
          return null;
        }
        return (
          <img
            src={urlFor(value).auto('format').fit('max').url()}
            alt={value.alt || ' '}
            loading="lazy"
            style={{ width: '100%', height: 'auto', borderRadius: '0.5rem', marginTop: '2rem', marginBottom: '2rem' }}
          />
        );
      },
      code: ({ value }: any) => {
        return mdxComponents.code ? mdxComponents.code({ children: value.code } as any) : <code>{value.code}</code>;
      }
    },
    marks: {
      link: ({ children, value }: any) => {
        const href = value.href || '';
        if (href.startsWith('/')) {
          return mdxComponents.a ? mdxComponents.a({ href, children } as any) : <a href={href}>{children}</a>;
        }
        return mdxComponents.a ? mdxComponents.a({ href, target: '_blank', rel: 'noopener noreferrer', children } as any) : <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
      },
      strong: ({ children }: any) => mdxComponents.strong ? mdxComponents.strong({ children } as any) : <strong>{children}</strong>,
      em: ({ children }: any) => mdxComponents.em ? mdxComponents.em({ children } as any) : <em>{children}</em>,
      code: ({ children }: any) => mdxComponents.code ? mdxComponents.code({ children } as any) : <code>{children}</code>,
    },
    block: {
      h1: ({ children }: any) => mdxComponents.h1 ? mdxComponents.h1({ children } as any) : <h1 className="font-semibold text-2xl mb-8 tracking-tighter">{children}</h1>,
      h2: ({ children }: any) => mdxComponents.h2 ? mdxComponents.h2({ children } as any) : <h2 className="font-medium text-xl mb-4 tracking-tighter">{children}</h2>,
      h3: ({ children }: any) => mdxComponents.h3 ? mdxComponents.h3({ children } as any) : <h3 className="font-medium text-lg mb-4 tracking-tighter">{children}</h3>,
      h4: ({ children }: any) => mdxComponents.h4 ? mdxComponents.h4({ children } as any) : <h4 className="font-medium mb-4 tracking-tighter">{children}</h4>,
      normal: ({ children }: any) => mdxComponents.p ? mdxComponents.p({ children } as any) : <p className="mb-4">{children}</p>,
      blockquote: ({ children }: any) => mdxComponents.blockquote ? mdxComponents.blockquote({ children } as any) : <blockquote className="border-l-4 border-neutral-300 dark:border-neutral-700 pl-4 italic my-4">{children}</blockquote>
    },
    list: {
      bullet: ({ children }: any) => mdxComponents.ul ? mdxComponents.ul({ children } as any) : <ul className="list-disc pl-6 mb-4">{children}</ul>,
      number: ({ children }: any) => mdxComponents.ol ? mdxComponents.ol({ children } as any) : <ol className="list-decimal pl-6 mb-4">{children}</ol>
    },
    listItem: {
      bullet: ({ children }: any) => mdxComponents.li ? mdxComponents.li({ children } as any) : <li className="mb-1">{children}</li>,
      number: ({ children }: any) => mdxComponents.li ? mdxComponents.li({ children } as any) : <li className="mb-1">{children}</li>
    }
  };

  return (
    <section>
      <h1 className="title font-semibold text-2xl tracking-tighter">
        {post.title}
      </h1>
      <div className="flex justify-between items-center mt-2 mb-8 text-sm">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {new Date(post.publishedAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}
        </p>
      </div>
      <article className="prose prose-invert">
        <PortableText value={post.body} components={ptComponents} />
      </article>
    </section>
  );
}
