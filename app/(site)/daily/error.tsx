'use client';

import { useEffect } from 'react';

export default function DailyError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[daily-error]', error.digest ?? error.message);
  }, [error]);

  return (
    <div className="py-16">
      <p className="text-gray-500 dark:text-zinc-400 text-sm mb-4">
        something went wrong loading the daily list.
      </p>
      <button
        onClick={reset}
        className="text-sm text-gray-400 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-zinc-100 transition-colors"
      >
        try again
      </button>
    </div>
  );
}
