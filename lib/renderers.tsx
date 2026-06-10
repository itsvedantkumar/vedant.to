import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { highlight } from 'sugar-high';
import { SITE_URL } from '@/lib/constants';

const linkClass =
  'text-blue-500 hover:text-blue-700 dark:text-gray-400 hover:dark:text-gray-300 dark:underline dark:underline-offset-2 dark:decoration-gray-800';

export const renderers = {
  inline: {
    bold: ({ children }: { children: React.ReactNode }) => (
      <strong className="font-medium">{children}</strong>
    ),
    italic: ({ children }: { children: React.ReactNode }) => (
      <em className="italic">{children}</em>
    ),
    // Inline code is a mark: children is a ReactNode (text), not a raw string.
    // sugar-high is only for code BLOCKS, so render inline code plainly.
    code: ({ children }: { children: React.ReactNode }) => <code>{children}</code>,
    // Fallback: image can appear in inline context if inserted inside a paragraph.
    // Render it as a block-style image rather than throwing.
    image: ({ src, alt }: { src: string; alt: string }) => (
      <Image
        src={src}
        alt={alt ?? ''}
        width={0}
        height={0}
        sizes="(max-width: 768px) 100vw, 768px"
        className="max-w-full h-auto rounded-lg"
      />
    ),
    link: ({ href, children }: { href: string; children: React.ReactNode }) => {
      const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:'];
      let safehref = href;
      try {
        const parsed = new URL(href, SITE_URL);
        if (!SAFE_PROTOCOLS.includes(parsed.protocol)) safehref = '#';
      } catch {
        safehref = '#';
      }
      if (safehref.startsWith('/') || safehref.startsWith('#')) {
        return (
          <Link href={safehref} className={linkClass}>
            {children}
          </Link>
        );
      }
      return (
        <a
          href={safehref}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
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
        className="text-gray-800 dark:text-zinc-300 leading-relaxed mb-3"
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
      // h1 is reserved for the page title; content should start at h2.
      // h1 here is a graceful fallback styled identically to h2.
      const classMap: Record<number, string> = {
        1: 'text-xl font-medium tracking-tight text-gray-900 dark:text-zinc-100 mt-10 mb-3',
        2: 'text-xl font-medium tracking-tight text-gray-900 dark:text-zinc-100 mt-10 mb-3',
        3: 'text-lg font-medium text-gray-900 dark:text-zinc-100 mt-8 mb-2',
        4: 'font-medium text-gray-900 dark:text-zinc-100 mt-6 mb-1',
        5: 'text-sm font-medium text-gray-700 dark:text-zinc-300 mt-4 mb-1',
        6: 'text-sm font-medium text-gray-500 dark:text-zinc-400 mt-4',
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
    // Code blocks receive a raw string + language — highlight with sugar-high.
    code: ({ children, language }: { children: string; language?: string }) => {
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
      <blockquote className="ml-[0.075em] border-l-[3px] border-gray-300 pl-4 text-gray-700 dark:border-zinc-600 dark:text-zinc-300">
        {children}
      </blockquote>
    ),
    divider: () => <hr />,
    image: ({ src, alt, title }: { src: string; alt: string; title?: string }) => (
      <Image
        src={src}
        alt={alt ?? ''}
        title={title}
        width={0}
        height={0}
        sizes="100vw"
        className="w-full h-auto rounded-lg mt-8 mb-8"
      />
    ),
    // `list` receives an array of list-item elements and must wrap each in <li> itself.
    list: ({
      type,
      children,
    }: {
      type: 'ordered' | 'unordered';
      children: React.ReactElement[];
    }) => {
      const items = children.map((child, i) => (
        <li key={i} className="pl-1">
          {child}
        </li>
      ));
      return type === 'ordered' ? (
        <ol className="text-gray-800 dark:text-zinc-300 list-decimal pl-5 space-y-2">
          {items}
        </ol>
      ) : (
        <ul className="text-gray-800 dark:text-zinc-300 list-disc pl-5 space-y-1">
          {items}
        </ul>
      );
    },
    table: ({ children }: { children: React.ReactNode }) => (
      <div className="overflow-x-auto my-6">
        <table className="w-full text-sm border-collapse text-gray-800 dark:text-zinc-300">
          {children}
        </table>
      </div>
    ),
    table_head: ({ children }: { children: React.ReactNode }) => (
      <thead className="border-b border-gray-200 dark:border-zinc-700">{children}</thead>
    ),
    table_body: ({ children }: { children: React.ReactNode }) => (
      <tbody>{children}</tbody>
    ),
    table_row: ({ children }: { children: React.ReactNode }) => (
      <tr className="border-b border-gray-100 dark:border-zinc-800">{children}</tr>
    ),
    table_cell: ({
      children,
      header,
    }: {
      children: React.ReactNode;
      header?: boolean;
    }) =>
      header ? (
        <th className="py-2 pr-4 text-left font-medium text-gray-900 dark:text-zinc-100">
          {children}
        </th>
      ) : (
        <td className="py-2 pr-4">{children}</td>
      ),
  },
};
