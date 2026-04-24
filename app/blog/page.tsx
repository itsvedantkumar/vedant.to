import Link from 'next/link';
import { sanityFetch } from '../../sanity/client';

export default async function BlogPage() {
  const posts = await sanityFetch({
    query: `*[_type == "post"] | order(publishedAt desc) {
      _id,
      title,
      slug,
      publishedAt
    }`
  });

  const safePosts = Array.isArray(posts) ? posts : [];

  return (
    <div>
      <h1 className="font-semibold text-2xl mb-8 tracking-tighter">Blog</h1>
      {safePosts.map((post: any) => (
        <Link
          key={post._id}
          className="flex flex-col space-y-1 mb-4"
          href={`/blog/${post.slug.current}`}
        >
          <div className="w-full flex flex-col md:flex-row space-x-0 md:space-x-2">
            <p className="text-gray-500 dark:text-gray-400 w-[100px] tabular-nums">
              {new Date(post.publishedAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              })}
            </p>
            <p className="text-gray-900 dark:text-gray-100 tracking-tight">
              {post.title}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
