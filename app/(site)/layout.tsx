import Link from 'next/link';

const navLinks = [
  { name: 'home', href: '/' },
  { name: 'blog', href: '/blog' },
];

const footerLinks = [
  { name: 'x', url: 'https://x.com/itsvedantkumar' },
  { name: 'linkedin', url: 'https://www.linkedin.com/in/itsvedantkumar' },
  { name: 'rss', url: '/rss.xml' },
];

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col p-8 dark:bg-zinc-950 bg-white text-gray-900 dark:text-zinc-200">
      <div className="max-w-[60ch] mx-auto w-full flex flex-col flex-1">
        <nav className="flex gap-4 mb-12">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className="text-gray-400 dark:text-gray-500 hover:text-blue-500 transition-colors duration-200 tracking-tight"
            >
              {link.name}
            </Link>
          ))}
        </nav>
        <main className="space-y-6 flex-1">{children}</main>
        <footer className="mt-16">
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
    </div>
  );
}
