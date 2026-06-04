// schema.org JSON-LD, built automatically from existing data — no per-post
// hand-mapping. Drop each into a <script type="application/ld+json"> tag.

const SITE_URL = 'https://vedant.to';
const AUTHOR = 'Vedant Kumar';
const SOCIALS = [
  'https://x.com/itsvedantkumar',
  'https://www.linkedin.com/in/itsvedantkumar',
];

const person = {
  '@type': 'Person',
  name: AUTHOR,
  url: SITE_URL,
  email: 'vedant@simulacrum.world',
  image: `${SITE_URL}/icon-512.png`,
  sameAs: SOCIALS,
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
  const published = new Date(publishedAt).toISOString();
  const modified = new Date(updatedAt ?? publishedAt).toISOString();

  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description,
    datePublished: published,
    dateModified: modified,
    url,
    mainEntityOfPage: url,
    image: image ?? `${SITE_URL}/api/og?title=${encodeURIComponent(title)}`,
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
      name: 'Vedant',
      url: SITE_URL,
      potentialAction: {
        '@type': 'SearchAction',
        target: `${SITE_URL}/blog?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
    { '@context': 'https://schema.org', ...person },
  ];
}
