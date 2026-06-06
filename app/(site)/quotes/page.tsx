import { reader } from '@/lib/reader';
import { createMetadata } from '@/lib/metadata';

export const metadata = createMetadata({
  title: 'Quotes',
  description: 'Lines that stuck.',
  path: '/quotes',
});

export const revalidate = false;

export default async function QuotesPage() {
  const all = await reader.collections.quotes.all();

  const quotes = all.sort((a, b) => a.slug.localeCompare(b.slug));

  return (
    <div>
      <h1 className="font-medium text-2xl mb-10 tracking-tight">Quotes</h1>
      {quotes.length === 0 && (
        <p className="text-gray-400 dark:text-gray-500">Nothing here yet.</p>
      )}
      <div className="space-y-8">
        {quotes.map(({ slug, entry }) => (
          <blockquote
            key={slug}
            className="border-l-2 border-gray-200 dark:border-zinc-700 pl-4"
          >
            <p className="text-gray-800 dark:text-zinc-200 leading-relaxed tracking-tight">
              {entry.quote}
            </p>
          </blockquote>
        ))}
      </div>
    </div>
  );
}
