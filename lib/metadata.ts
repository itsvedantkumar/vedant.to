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

export function ogImageUrl(title: string): string {
  return `${SITE_URL}/api/og?title=${encodeURIComponent(title)}`;
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
    alternates: { canonical: path },
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
