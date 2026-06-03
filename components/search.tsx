'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

interface Item {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  text: string;
}

export function Search() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    fetch('/search-index.json')
      .then((r) => r.json())
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return items
      .filter(
        (i) =>
          i.title.toLowerCase().includes(term) ||
          i.excerpt.toLowerCase().includes(term) ||
          i.text.toLowerCase().includes(term)
      )
      .slice(0, 8);
  }, [query, items]);

  return (
    <div className="mb-8">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search posts…"
        aria-label="Search posts"
        className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
      />
      {query.trim() && (
        <div className="mt-3">
          {results.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No matches.</p>
          ) : (
            <ul className="space-y-2">
              {results.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={`/blog/${r.slug}`}
                    className="text-gray-900 hover:text-blue-500 dark:text-gray-100 dark:hover:text-blue-400"
                  >
                    {r.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
