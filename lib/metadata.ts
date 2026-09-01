import type { Metadata } from 'next';
import { SITE_URL, SITE_NAME, TWITTER_HANDLE } from '@/lib/constants';

interface PageMetadataOptions {
  title: string;
  description: string;
  /** Canonical path, e.g. "/blog" */
  path: string;
  /** Override OG image URL. Defaults to auto-generated from title. */
  image?: string;
  /** For blog posts only */
  publishedAt?: string;
  /** For blog posts only — drives og:article:modified_time */
  updatedAt?: string | null;
}

/**
 * Feed discovery links, emitted as <link rel="alternate"> in <head>.
 *
 * Exported and reused by app/layout.tsx rather than declared in both:
 * Next merges metadata shallowly per top-level key, so a page that sets
 * `alternates` for its canonical URL replaces the root layout's
 * `alternates` object entirely and silently drops these. Every page here
 * sets a canonical, so declaring the types only at the root meant no page
 * ever emitted them.
 */
export const FEED_TYPES = {
  'application/rss+xml': '/rss.xml',
  'application/feed+json': '/feed.json',
} as const;

export function ogImageUrl(title: string): string {
  return `${SITE_URL}/api/og?title=${encodeURIComponent(title)}`;
}

/**
 * Absolute URL for a cover image. Anything that isn't already absolute or
 * root-relative is unrecognised data, so we return undefined rather than
 * fabricate a URL — callers fall back to the generated OG image instead of
 * publishing a 404 into metadata, JSON-LD, or the feed.
 */
export function coverImageUrl(coverImage: string | null | undefined): string | undefined {
  if (!coverImage) return undefined;
  if (coverImage.startsWith('https://')) return coverImage;
  if (coverImage.startsWith('/')) return `${SITE_URL}${coverImage}`;
  return undefined;
}

export function createMetadata({
  title,
  description,
  path,
  image,
  publishedAt,
  updatedAt,
}: PageMetadataOptions): Metadata {
  const url = `${SITE_URL}${path}`;
  const ogImage = image ?? ogImageUrl(title);

  return {
    title,
    description,
    alternates: { canonical: path, types: FEED_TYPES },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: 'en_US',
      type: publishedAt ? 'article' : 'website',
      ...(publishedAt ? { publishedTime: publishedAt } : {}),
      ...(updatedAt ? { modifiedTime: updatedAt } : {}),
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      creator: TWITTER_HANDLE,
      images: [ogImage],
    },
  };
}
