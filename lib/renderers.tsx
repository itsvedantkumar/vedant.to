import React, { cache } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { highlight } from 'sugar-high';
import { SITE_URL } from '@/lib/constants';

const linkClass =
  'text-blue-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-gray-300 dark:underline dark:underline-offset-2 dark:decoration-gray-800';

type Dims = { width: number; height: number };

/** WebP dimensions from the RIFF header (VP8X / lossy VP8 / lossless VP8L). */
function parseWebP(b: Uint8Array): Dims | null {
  if (b.length < 30) return null;
  const ascii = (o: number, n: number) =>
    String.fromCharCode(...Array.from(b.subarray(o, o + n)));
  if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WEBP') return null;
  const chunk = ascii(12, 4);
  if (chunk === 'VP8X') {
    return {
      width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)),
      height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)),
    };
  }
  if (chunk === 'VP8 ') {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return {
      width: (b[26] | (b[27] << 8)) & 0x3fff,
      height: (b[28] | (b[29] << 8)) & 0x3fff,
    };
  }
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return null;
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  return null;
}

/** PNG dimensions from the IHDR chunk. */
function parsePNG(b: Uint8Array): Dims | null {
  if (b.length < 24) return null;
  if (b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return null;
  const be32 = (o: number) =>
    ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  return { width: be32(16), height: be32(20) };
}

// Body images are remote CDN URLs (the assets host), so there is no local
// file to statically import dimensions from. Probe the first bytes of the
// image instead. These renderers only run in RSC pages that are fully static
// (`revalidate = false`), so the probe happens at build time, not per request.
// react cache() dedupes repeated srcs within a render pass.
/**
 * The probe fails open: a build that cannot reach the CDN still renders, just
 * without intrinsic dimensions, so the layout shift this code exists to remove
 * comes back. Name the src and the reason in the build log rather than leaving
 * that silent. A warning is the right level here, not a thrown error — failing
 * the whole build over one CDN blip trades a layout shift for an outage.
 */
function warnProbeFailed(src: string, reason: string): null {
  console.warn(
    `renderers: image dimension probe failed for ${src} (${reason}); ` +
      'rendering it without width/height, which reintroduces layout shift for that image.'
  );
  return null;
}

const probeImageDims = cache(async (src: string): Promise<Dims | null> => {
  if (!/^https?:\/\//.test(src)) return null;
  try {
    const res = await fetch(src, {
      headers: { range: 'bytes=0-255' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return warnProbeFailed(src, `HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    // Content pipeline normalizes CDN images to .webp (scripts/normalize-images.mjs);
    // PNG covers stragglers. Anything else falls through to the width-0 fallback.
    return (
      parseWebP(bytes) ??
      parsePNG(bytes) ??
      warnProbeFailed(src, 'unrecognized image header')
    );
  } catch (err) {
    return warnProbeFailed(src, err instanceof Error ? err.message : String(err));
  }
});

/**
 * Async server component: real width/height give the browser an intrinsic
 * aspect ratio, so `h-auto` reserves the right space before the file loads and
 * scrolling into an image causes no layout shift. If the probe fails (offline
 * build, non-http src), fall back to width/height 0 — the pre-fix behavior,
 * where CSS alone sizes the image.
 */
async function BodyImage({
  src,
  alt,
  title,
  sizes,
  className,
}: {
  src: string;
  alt: string;
  title?: string;
  sizes: string;
  className: string;
}) {
  const dims = await probeImageDims(src);
  return (
    <Image
      src={src}
      alt={alt ?? ''}
      title={title}
      width={dims?.width ?? 0}
      height={dims?.height ?? 0}
      sizes={sizes}
      className={className}
    />
  );
}

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
      <BodyImage
        src={src}
        alt={alt}
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
      <BodyImage
        src={src}
        alt={alt}
        title={title}
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
    // Keystatic's real contract (@keystatic/core renderer.d.ts) is a single
    // `table` renderer receiving `{ head?, body }` — not a `children`-based
    // tree of table_head/table_body/table_row/table_cell renderers. Those
    // keys aren't part of the Renderers type and DocumentRenderer never
    // invokes them; it walks the raw document nodes itself and only ever
    // calls `renderers.block.table` with the already-assembled head/body.
    table: ({
      head,
      body,
    }: {
      head?: { children: React.ReactNode; colSpan?: number; rowSpan?: number }[];
      body: { children: React.ReactNode; colSpan?: number; rowSpan?: number }[][];
    }) => (
      <div className="overflow-x-auto my-6">
        <table className="w-full text-sm border-collapse text-gray-800 dark:text-zinc-300">
          {head && (
            <thead className="border-b border-gray-200 dark:border-zinc-700">
              <tr>
                {head.map((cell, i) => (
                  <th
                    key={i}
                    colSpan={cell.colSpan}
                    rowSpan={cell.rowSpan}
                    className="py-2 pr-4 text-left font-medium text-gray-900 dark:text-zinc-100"
                  >
                    {cell.children}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {body.map((row, i) => (
              <tr key={i} className="border-b border-gray-100 dark:border-zinc-800">
                {row.map((cell, j) => (
                  <td
                    key={j}
                    colSpan={cell.colSpan}
                    rowSpan={cell.rowSpan}
                    className="py-2 pr-4"
                  >
                    {cell.children}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  },
};
