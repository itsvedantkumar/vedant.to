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
            src={urlFor(value).url()}
            alt={value.alt || ' '}
            loading="lazy"
            style={{ width: '100%', height: 'auto', borderRadius: '0.5rem', marginTop: '2rem', marginBottom: '2rem' }}
          />
        );
      }
    },
    marks: {
      link: ({ children, value }: any) => {
        const href = value.href || '';
        if (href.startsWith('/')) {
          return mdxComponents.a ? mdxComponents.a({ href, children } as any) : <a href={href}>{children}</a>;
        }
        return mdxComponents.a ? mdxComponents.a({ href, target: '_blank', rel: 'noopener noreferrer', children } as any) : <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
      }
    },
    block: {
      h1: ({ children }: any) => mdxComponents.h1 ? mdxComponents.h1({ children } as any) : <h1>{children}</h1>,
      h2: ({ children }: any) => mdxComponents.h2 ? mdxComponents.h2({ children } as any) : <h2>{children}</h2>,
      h3: ({ children }: any) => mdxComponents.h3 ? mdxComponents.h3({ children } as any) : <h3>{children}</h3>,
      h4: ({ children }: any) => mdxComponents.h4 ? mdxComponents.h4({ children } as any) : <h4>{children}</h4>,
      normal: ({ children }: any) => mdxComponents.p ? mdxComponents.p({ children } as any) : <p>{children}</p>,
      blockquote: ({ children }: any) => mdxComponents.blockquote ? mdxComponents.blockquote({ children } as any) : <blockquote>{children}</blockquote>
    },
    list: {
      bullet: ({ children }: any) => mdxComponents.ul ? mdxComponents.ul({ children } as any) : <ul>{children}</ul>,
      number: ({ children }: any) => mdxComponents.ol ? mdxComponents.ol({ children } as any) : <ol>{children}</ol>
    },
    listItem: {
      bullet: ({ children }: any) => mdxComponents.li ? mdxComponents.li({ children } as any) : <li>{children}</li>,
      number: ({ children }: any) => mdxComponents.li ? mdxComponents.li({ children } as any) : <li>{children}</li>
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
