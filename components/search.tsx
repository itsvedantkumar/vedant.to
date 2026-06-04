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
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) setQuery(q);
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
    <div className="mb-5">
      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-zinc-800 pb-1.5 focus-within:border-blue-400 dark:focus-within:border-blue-500 transition-colors duration-200">
        <svg
          width="14"
          height="14"
          className="shrink-0 text-gray-300 dark:text-zinc-600 transition-colors duration-200"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
          />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search posts"
          aria-label="Search posts"
          className="flex-1 bg-transparent dark:bg-zinc-950 border-0 text-sm text-gray-900 dark:text-zinc-200 placeholder:text-gray-300 dark:placeholder:text-zinc-600 focus:outline-none tracking-tight"
        />
      </div>
      {query.trim() && (
        <div className="mt-4 pl-6">
          {results.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-zinc-600 tracking-tight">
              no matches
            </p>
          ) : (
            <ul className="space-y-2">
              {results.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={`/blog/${r.slug}`}
                    className="text-sm text-gray-500 dark:text-zinc-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors duration-200 tracking-tight"
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
