import { config, fields, collection } from '@keystatic/core';

const ASSETS_PUBLIC_PATH = 'https://assets.vedant.to/i/';

const draftField = fields.checkbox({
  label: 'Draft',
  description: 'Hidden from the site, feeds, sitemap, and search while checked.',
  defaultValue: false,
});

function makeDocumentField(imageDir: string) {
  return fields.document({
    label: 'Content',
    formatting: {
      headingLevels: [2, 3, 4],
      inlineMarks: true,
      listTypes: true,
      blockTypes: true,
      alignment: true,
      softBreaks: true,
    },
    dividers: true,
    links: true,
    images: { directory: imageDir, publicPath: ASSETS_PUBLIC_PATH },
  });
}

export default config({
  storage:
    process.env.NODE_ENV === 'development'
      ? { kind: 'local' as const }
      : {
          kind: 'github' as const,
          repo: {
            owner: 'itsvedantkumar',
            name: 'vedant.to',
          },
        },
  ui: {
    brand: {
      name: 'vedant.to',
    },
  },
  collections: {
    quotes: collection({
      label: 'Quotes',
      slugField: 'slug',
      path: 'content/quotes/*',
      schema: {
        slug: fields.slug({
          name: { label: 'Slug (auto)' },
        }),
        quote: fields.text({
          label: 'Quote',
          multiline: true,
          validation: { isRequired: true },
        }),
      },
    }),
    posts: collection({
      label: 'Posts',
      slugField: 'title',
      path: 'content/posts/*',
      format: { contentField: 'content' },
      schema: {
        title: fields.slug({
          name: { label: 'Title' },
        }),
        publishedAt: fields.date({
          label: 'Published At',
          validation: { isRequired: true },
        }),
        updatedAt: fields.date({
          label: 'Updated At',
          description:
            'Optional — set when meaningfully revised. Drives "dateModified" for SEO.',
        }),
        draft: draftField,
        excerpt: fields.text({
          label: 'Excerpt',
          multiline: true,
        }),
        coverImage: fields.image({
          label: 'Cover Image',
          directory: 'public/images/posts',
          publicPath: ASSETS_PUBLIC_PATH,
        }),
        content: makeDocumentField('public/images/posts'),
      },
    }),
    daily: collection({
      label: 'Daily',
      slugField: 'slug',
      path: 'content/daily/*',
      format: { contentField: 'content' },
      schema: {
        slug: fields.slug({
          name: { label: 'Slug (e.g. 2026-06-07)' },
        }),
        date: fields.date({
          label: 'Date',
          validation: { isRequired: true },
        }),
        draft: draftField,
        content: makeDocumentField('public/images/daily'),
      },
    }),
  },
});
