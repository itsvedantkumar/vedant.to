import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col justify-between pt-0 md:pt-8 p-8 dark:bg-zinc-950 bg-white text-gray-900 dark:text-zinc-200">
      <main className="max-w-[60ch] mx-auto w-full space-y-6 pt-24">
        <h1 className="font-medium text-2xl tracking-tight">404</h1>
        <p className="text-gray-600 dark:text-zinc-400">This page doesn&apos;t exist.</p>
        <Link
          href="/"
          className="inline-block text-sm text-blue-500 hover:text-blue-600 transition-colors"
        >
          ← Go home
        </Link>
      </main>
    </div>
  );
}
