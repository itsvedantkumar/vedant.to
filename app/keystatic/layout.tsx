import Link from 'next/link';

export default function KeystaticLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <nav className="px-8 py-4 border-b border-gray-100 dark:border-zinc-800">
        <div className="max-w-[60ch] mx-auto flex gap-4">
          <Link
            href="/"
            className="text-gray-400 dark:text-gray-500 hover:text-blue-500 transition-colors duration-200 tracking-tight"
          >
            home
          </Link>
          <Link
            href="/blog"
            className="text-gray-400 dark:text-gray-500 hover:text-blue-500 transition-colors duration-200 tracking-tight"
          >
            blog
          </Link>
        </div>
      </nav>
      {children}
    </div>
  );
}
