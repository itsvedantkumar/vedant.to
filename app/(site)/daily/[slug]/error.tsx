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
    <section className="py-12">
      <h1 className="text-xl font-medium mb-4">Something went wrong</h1>
      <button onClick={reset} className="text-sm text-blue-500 hover:text-blue-700">
        Try again
      </button>
    </section>
  );
}
