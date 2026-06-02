const links = [
  { name: 'github', url: 'https://github.com/itsvedantkumar' },
  { name: '@itsvedantkumar', url: 'https://x.com/itsvedantkumar' },
  { name: 'linkedin', url: 'https://www.linkedin.com/in/itsvedantkumar' },
];

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col justify-between pt-0 md:pt-8 p-8 dark:bg-zinc-950 bg-white text-gray-900 dark:text-zinc-200">
      <main className="max-w-[60ch] mx-auto w-full space-y-6">
        {children}
      </main>
      <footer className="mt-12 text-center">
        <div className="flex justify-center space-x-4 tracking-tight">
          {links.map((link) => (
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
  );
}
