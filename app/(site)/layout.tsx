import Link from 'next/link';

const navLinks = [
  { name: 'home', href: '/' },
  { name: 'blog', href: '/blog' },
  { name: 'letterboxd', href: 'https://letterboxd.com/itsvedantkumar/', external: true },
  {
    name: 'spotify',
    href: 'https://open.spotify.com/user/gh4xje04nt4gjokd86fklfwuw',
    external: true,
  },
];

const footerLinks = [
  { name: 'x', url: 'https://x.com/itsvedantkumar' },
  { name: 'linkedin', url: 'https://www.linkedin.com/in/itsvedantkumar' },
  { name: 'rss', url: '/rss.xml' },
  { name: 'cal', url: 'https://calendar.app.google/nB6tr8kyTD2mwkCa8' },
];

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col p-8 pb-20 md:pb-8 dark:bg-zinc-950 bg-white text-gray-900 dark:text-zinc-200">
      <div className="max-w-[60ch] mx-auto w-full flex flex-col flex-1">
        <nav className="flex flex-wrap gap-4 mb-12">
          {navLinks.map((link) =>
            link.external ? (
              <a
                key={link.name}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 dark:text-gray-500 hover:text-blue-500 transition-colors duration-200 tracking-tight"
              >
                {link.name}
              </a>
            ) : (
              <Link
                key={link.name}
                href={link.href}
                className="text-gray-400 dark:text-gray-500 hover:text-blue-500 transition-colors duration-200 tracking-tight"
              >
                {link.name}
              </Link>
            )
          )}
        </nav>
        <main className="space-y-6 flex-1">{children}</main>
        <footer className="mt-16 hidden md:block">
          <div className="flex justify-center space-x-4 tracking-tight">
            {footerLinks.map((link) => (
              <a
                key={link.name}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 dark:text-gray-500 hover:text-blue-500 transition-colors duration-200"
              >
                {link.name}
              </a>
            ))}
          </div>
        </footer>
      </div>
      {/* Mobile sticky footer */}
      <footer className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-zinc-950/90 backdrop-blur border-t border-gray-100 dark:border-zinc-800 px-8 py-3">
        <div className="flex justify-center space-x-6 tracking-tight">
          {footerLinks.map((link) => (
            <a
              key={link.name}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 dark:text-gray-500 hover:text-blue-500 transition-colors duration-200 text-sm"
            >
              {link.name}
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
}
