import { createClient } from 'next-sanity';
import imageUrlBuilder from '@sanity/image-url';

export const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || 'dummy-project-id', // Replace with real ID in Vercel
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || 'production',
  apiVersion: '2024-01-01',
  useCdn: true,
});

const builder = imageUrlBuilder(client);

export function urlFor(source: any) {
  return builder.image(source);
}

export async function sanityFetch({ query, params = {} }: { query: string; params?: any }) {
  if (process.env.NEXT_PUBLIC_SANITY_PROJECT_ID === 'dummy-project-id' || !process.env.NEXT_PUBLIC_SANITY_PROJECT_ID) {
    // Return null to allow local dummy build to pass if Vercel ENVs are not set yet
    return null;
  }
  return client.fetch(query, params);
}
