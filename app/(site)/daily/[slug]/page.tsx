import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DocumentRenderer } from '@keystatic/core/renderer';
import { reader } from '@/lib/reader';
import { getPublishedDailyEntries } from '@/lib/daily';
import { renderers } from '@/lib/renderers';
import { createMetadata } from '@/lib/metadata';
import { normalizeDoc } from '@/lib/normalize-doc';
import { formatDate } from '@/lib/date';
import { FOCUS_RING } from '@/lib/styles';

export const revalidate = false;

export async function generateStaticParams() {
  const entries = await getPublishedDailyEntries();
  return entries.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const entry = await reader.collections.daily.read(slug);
    if (!entry || !entry.date || entry.draft) return {};

    const dateLabel = formatDate(entry.date, 'long');

    return createMetadata({
      title: dateLabel,
      description: `A daily note from ${dateLabel}`,
      path: `/daily/${slug}`,
      publishedAt: entry.date,
    });
  } catch (err) {
    console.error('[daily] generateMetadata failed for slug:', slug, err);
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
        {/*
          Cast is load-bearing: @keystatic/core resolves its `Renderers`
          type against its own nested @types/react@19.2.16 (pulled in via
          @keystar/ui), while this repo's root @types/react@18.3.28 types
          lib/renderers.tsx. React 19 narrowed ReactElement's default prop
          generic from `any` to `unknown`, so `tsc` refuses a direct
          single-step cast (TS2352: "neither type sufficiently overlaps")
          on almost every renderer entry. Full incompatibility + the
          removal condition are documented at the matching cast in
          app/(site)/blog/[slug]/page.tsx.
        */}
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
              className={`group max-w-[45%] text-gray-500 hover:text-blue-500 dark:text-gray-400 ${FOCUS_RING}`}
            >
              <span className="block text-xs text-gray-400 dark:text-gray-600">
                ← Older
              </span>
              <span className="text-gray-900 dark:text-gray-100">
                {formatDate(older.entry.date, 'short')}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {newer ? (
            <Link
              href={`/daily/${newer.slug}`}
              className={`group max-w-[45%] text-right text-gray-500 hover:text-blue-500 dark:text-gray-400 ${FOCUS_RING}`}
            >
              <span className="block text-xs text-gray-400 dark:text-gray-600">
                Newer →
              </span>
              <span className="text-gray-900 dark:text-gray-100">
                {formatDate(newer.entry.date, 'short')}
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
