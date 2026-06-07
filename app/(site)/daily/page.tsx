import Link from 'next/link';
import { getPublishedDailyEntries } from '@/lib/daily';
import { createMetadata } from '@/lib/metadata';

export const metadata = createMetadata({
  title: 'Daily',
  description: 'Daily notes, thoughts, and observations.',
  path: '/daily',
});

export const revalidate = false;

export default async function DailyPage() {
  const entries = await getPublishedDailyEntries();

  return (
    <div>
      <h1 className="font-medium text-2xl mb-6 tracking-tight">Daily</h1>
      {entries.length === 0 && (
        <p className="text-gray-500 dark:text-gray-400">No entries yet.</p>
      )}
      <div className="space-y-3">
        {entries.map(({ slug, entry }) => (
          <Link key={slug} className="block group" href={`/daily/${slug}`}>
            <span className="text-gray-900 dark:text-gray-100 tracking-tight tabular-nums group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors duration-150">
              {new Date(entry.date!).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
