import { redirect } from 'next/navigation';

export default function Home() {
  // We deleted the old generic app/page.mdx homepage.
  // Redirect root requests to our newly constructed, rebranded /blog listing page.
  redirect('/blog');
}
