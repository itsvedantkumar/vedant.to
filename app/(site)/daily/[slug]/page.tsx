import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DocumentRenderer } from '@keystatic/core/renderer';
import { reader } from '@/lib/reader';
import { getPublishedDailyEntries } from '@/lib/daily';
import { renderers } from '@/lib/renderers';
import { createMetadata } from '@/lib/metadata';
import { normalizeDoc } from '@/lib/normalize-doc';
import { formatDate } from '@/lib/date';

export const revalidate = false;

export async function generateStaticParams() {
  const entries = await getPublishedDailyEntries();
  return entries.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  try {
    const entry = await reader.collections.daily.read(slug);
    if (!entry || !entry.date || entry.draft) return {};

    const dateLabel = formatDate(entry.date, 'long');

    return createMetadata({
      title: dateLabel,
      description: dateLabel,
      path: `/daily/${slug}`,
      publishedAt: entry.date,
    });
  } catch {
    return {};
  }
}

export default async function DailyEntry({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = await reader.collections.daily.read(slug);

  if (!entry || !entry.date || entry.draft) notFound();

  const raw = await entry.content();
  const content = normalizeDoc(raw);

  const all = await getPublishedDailyEntries();
  const idx = all.findIndex((e) => e.slug === slug);
  const newer = idx > 0 ? all[idx - 1] : null;
  const older = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;

  const dateLabel = formatDate(entry.date, 'long');

  return (
    <section>
      <h1 className="text-2xl font-medium tracking-tight mb-8">{dateLabel}</h1>
      <article>
        <DocumentRenderer
          document={content}
          renderers={
            renderers as unknown as Parameters<typeof DocumentRenderer>[0]['renderers']
          }
        />
      </article>

      {(newer || older) && (
        <nav className="mt-16 flex justify-between gap-4 border-t border-gray-100 pt-6 text-sm dark:border-zinc-800">
          {older ? (
            <Link
              href={`/daily/${older.slug}`}
              className="group max-w-[45%] text-gray-500 hover:text-blue-500 dark:text-gray-400"
            >
              <span className="block text-xs text-gray-400 dark:text-gray-600">
                ← Older
              </span>
              <span className="text-gray-900 dark:text-gray-100">
                {formatDate(older.entry.date!, 'short')}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {newer ? (
            <Link
              href={`/daily/${newer.slug}`}
              className="group max-w-[45%] text-right text-gray-500 hover:text-blue-500 dark:text-gray-400"
            >
              <span className="block text-xs text-gray-400 dark:text-gray-600">
                Newer →
              </span>
              <span className="text-gray-900 dark:text-gray-100">
                {formatDate(newer.entry.date!, 'short')}
              </span>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  );
}
