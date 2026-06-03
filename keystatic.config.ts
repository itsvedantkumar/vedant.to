import { config, fields, collection } from '@keystatic/core';

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
        excerpt: fields.text({
          label: 'Excerpt',
          multiline: true,
        }),
        coverImage: fields.image({
          label: 'Cover Image',
          directory: 'public/images/posts',
          publicPath: '/images/posts/',
        }),
        content: fields.document({
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
          images: {
            directory: 'public/images/posts',
            publicPath: '/images/posts/',
          },
        }),
      },
    }),
  },
});
