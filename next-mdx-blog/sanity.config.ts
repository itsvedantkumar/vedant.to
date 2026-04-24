import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { author } from './sanity/schemas/author';
import { post } from './sanity/schemas/post';

export default defineConfig({
  basePath: '/studio',
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || 'dummy-project-id',
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || 'production',
  title: 'Vedant Blog Studio',
  schema: {
    types: [author, post],
  },
  plugins: [structureTool()],
});
