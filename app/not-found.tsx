import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col justify-between pt-0 md:pt-8 p-8 dark:bg-zinc-950 bg-white text-gray-900 dark:text-zinc-200">
      <main className="max-w-[60ch] mx-auto w-full space-y-6 pt-24">
        <h1 className="font-medium text-2xl tracking-tight">404</h1>
        <p className="text-gray-600 dark:text-zinc-400">
          you&apos;re looking in the wrong place.
        </p>
        <Link
          href="/"
          className="inline-block text-sm text-gray-400 dark:text-zinc-600 hover:text-blue-500 transition-colors"
        >
          ← go back
        </Link>
        <p
          className="text-gray-200 dark:text-zinc-900 text-xs mt-8 select-none"
          aria-hidden
        >
          or maybe try saying something instead.
        </p>
      </main>
    </div>
  );
}
