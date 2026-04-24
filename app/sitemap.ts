import { sanityFetch } from '../sanity/client';

const SITE_URL = 'https://vedant.to';

export default async function sitemap() {
  const posts = await sanityFetch({
    query: `*[_type == "post"] {
      slug,
      publishedAt
    }`
  });

  const safePosts = Array.isArray(posts) ? posts : [];

  const blogPosts = safePosts.map((post: any) => ({
    url: `${SITE_URL}/blog/${post.slug.current}`,
    lastModified: new Date(post.publishedAt).toISOString()
  }));

  const routes = ['', '/blog'].map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: new Date().toISOString()
  }));

  return [...routes, ...blogPosts];
}
