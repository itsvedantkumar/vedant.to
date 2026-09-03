// schema.org JSON-LD, built automatically from existing data — no per-post
// hand-mapping. Drop each into a <script type="application/ld+json"> tag.

import { ogImageUrl } from './metadata';
import {
  SITE_URL,
  AUTHOR,
  CONTACT_EMAIL,
  SITE_NAME,
  SOCIAL_LINKS,
} from '@/lib/constants';

export const person = {
  '@type': 'Person',
  name: AUTHOR,
  url: SITE_URL,
  email: CONTACT_EMAIL,
  image: `${SITE_URL}/icon.png`,
  sameAs: Object.values(SOCIAL_LINKS).filter((link): link is string => link !== null),
};

interface ArticleSchemaInput {
  title: string;
  description: string;
  slug: string;
  publishedAt: string;
  updatedAt?: string | null;
  image?: string;
  wordCount?: number;
  minutes?: number;
}

export function articleSchema({
  title,
  description,
  slug,
  publishedAt,
  updatedAt,
  image,
  wordCount,
  minutes,
}: ArticleSchemaInput) {
  const url = `${SITE_URL}/blog/${slug}`;
  const safeIso = (s: string | null | undefined) => {
    const d = new Date(s ?? '');
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  };
  const published = safeIso(publishedAt);
  const modified = safeIso(updatedAt ?? publishedAt) ?? published;

  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description,
    datePublished: published,
    dateModified: modified,
    url,
    mainEntityOfPage: url,
    image: image ?? ogImageUrl(title),
    author: person,
    publisher: person,
    ...(wordCount ? { wordCount } : {}),
    ...(minutes ? { timeRequired: `PT${minutes}M` } : {}),
  };
}

// Emitted once site-wide (root layout) so search engines can resolve the site
// and its author as entities — a knowledge-panel / sitelinks signal.
export function siteSchema() {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      url: SITE_URL,
    },
    { '@context': 'https://schema.org', ...person },
  ];
}
