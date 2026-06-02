import React from 'react';
import Link from 'next/link';
import { highlight } from 'sugar-high';

const linkClass =
  'text-blue-500 hover:text-blue-700 dark:text-gray-400 hover:dark:text-gray-300 dark:underline dark:underline-offset-2 dark:decoration-gray-800';

export const renderers = {
  inline: {
    bold: ({ children }: { children: React.ReactNode }) => (
      <strong className="font-medium">{children}</strong>
    ),
    italic: ({ children }: { children: React.ReactNode }) => (
      <em className="font-medium">{children}</em>
    ),
    code: ({ children }: { children: string }) => {
      const codeHTML = highlight(children);
      return <code dangerouslySetInnerHTML={{ __html: codeHTML }} />;
    },
    link: ({ href, children }: { href: string; children: React.ReactNode }) => {
      if (href.startsWith('/') || href.startsWith('#')) {
        return (
          <Link href={href} className={linkClass}>
            {children}
          </Link>
        );
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {children}
        </a>
      );
    },
  },
  block: {
    paragraph: ({
      children,
      textAlign,
    }: {
      children: React.ReactNode;
      textAlign: 'center' | 'end' | undefined;
    }) => (
      <p
        className="text-gray-800 dark:text-zinc-300 leading-snug"
        style={textAlign ? { textAlign } : undefined}
      >
        {children}
      </p>
    ),
    heading: ({
      level,
      children,
      textAlign,
    }: {
      level: 1 | 2 | 3 | 4 | 5 | 6;
      children: React.ReactNode;
      textAlign: 'center' | 'end' | undefined;
    }) => {
      const classMap: Record<number, string> = {
        1: 'font-medium pt-12 mb-0',
        2: 'text-gray-800 dark:text-zinc-200 font-medium mt-8 mb-3',
        3: 'text-gray-800 dark:text-zinc-200 font-medium mt-8 mb-3',
        4: 'font-medium',
        5: 'font-medium',
        6: 'font-medium',
      };
      const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      return (
        <Tag
          className={classMap[level] ?? ''}
          style={textAlign ? { textAlign } : undefined}
        >
          {children}
        </Tag>
      );
    },
    code: ({ children, language }: { children: string; language: string | null }) => {
      const codeHTML = highlight(children);
      return (
        <pre>
          <code
            dangerouslySetInnerHTML={{ __html: codeHTML }}
            className={language ? `language-${language}` : ''}
          />
        </pre>
      );
    },
    blockquote: ({ children }: { children: React.ReactNode }) => (
      <blockquote className="ml-[0.075em] border-l-3 border-gray-300 pl-4 text-gray-700 dark:border-zinc-600 dark:text-zinc-300">
        {children}
      </blockquote>
    ),
    divider: () => <hr />,
    image: ({
      src,
      alt,
      title,
    }: {
      src: string;
      alt: string | null | undefined;
      title: string | null | undefined;
    }) => (
      <img
        src={src}
        alt={alt ?? ''}
        title={title ?? undefined}
        loading="lazy"
        style={{
          width: '100%',
          height: 'auto',
          borderRadius: '0.5rem',
          marginTop: '2rem',
          marginBottom: '2rem',
        }}
      />
    ),
    list: ({
      type,
      children,
    }: {
      type: 'ordered' | 'unordered';
      children: React.ReactNode;
    }) =>
      type === 'ordered' ? (
        <ol className="text-gray-800 dark:text-zinc-300 list-decimal pl-5 space-y-2">
          {children}
        </ol>
      ) : (
        <ul className="text-gray-800 dark:text-zinc-300 list-disc pl-5 space-y-1">
          {children}
        </ul>
      ),
    listItem: ({ children }: { children: React.ReactNode }) => (
      <li className="pl-1">{children}</li>
    ),
  },
};
