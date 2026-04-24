import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Revalidate the blog list and sitemap anytime a post is published/deleted
    revalidatePath('/blog');
    revalidatePath('/sitemap.xml');
    revalidatePath('/rss.xml');

    // If a slug is provided, revalidate the specific blog post path
    if (body.slug?.current) {
      revalidatePath(`/blog/${body.slug.current}`);
    }

    return NextResponse.json({ message: 'Revalidated successfully', body });
  } catch (err: any) {
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
