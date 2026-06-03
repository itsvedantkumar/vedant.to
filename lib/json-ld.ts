// Builds schema.org BlogPosting JSON-LD automatically from a post's existing
// fields — no per-post manual mapping. Drop the output into a
// <script type="application/ld+json"> tag.

const SITE_URL = 'https://vedant.to';
const AUTHOR = 'Vedant Kumar';

interface ArticleSchemaInput {
  title: string;
  description: string;
  slug: string;
  publishedAt: string;
}

export function articleSchema({
  title,
  description,
  slug,
  publishedAt,
}: ArticleSchemaInput) {
  const url = `${SITE_URL}/blog/${slug}`;
  const published = new Date(publishedAt).toISOString();

  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description,
    datePublished: published,
    dateModified: published,
    url,
    mainEntityOfPage: url,
    image: `${SITE_URL}/api/og?title=${encodeURIComponent(title)}`,
    author: { '@type': 'Person', name: AUTHOR, url: SITE_URL },
    publisher: { '@type': 'Person', name: AUTHOR, url: SITE_URL },
  };
}
