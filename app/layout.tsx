import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import AsciiArt from './components/AsciiArt';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://vedant.to'),
  alternates: {
    canonical: '/'
  },
  title: {
    default: 'Vedant',
    template: '%s | Vedant'
  },
  description: 'My portfolio, blog, and personal website.'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.className}`}>
      <body className="antialiased tracking-tight">
        <div className="min-h-screen flex flex-col justify-between pt-0 md:pt-8 p-8 dark:bg-zinc-950 bg-white text-gray-900 dark:text-zinc-200">
          <main className="max-w-[60ch] mx-auto w-full space-y-6">
            <Navbar />
            {children}
          </main>
          <Footer />
          <Analytics />
        </div>
      </body>
    </html>
  );
}

import Link from 'next/link';

function Navbar() {
  return (
    <nav className="flex justify-between items-center mb-12">
      <div className="flex space-x-4">
        <Link href="/" className="text-gray-900 dark:text-gray-100 hover:text-blue-500 transition-colors">home</Link>
        <Link href="/blog" className="text-gray-900 dark:text-gray-100 hover:text-blue-500 transition-colors">blog</Link>
      </div>
    </nav>
  );
}

function Footer() {
  const links = [
    { name: '@vedant', url: 'https://x.com/vedant' },
    { name: 'youtube', url: 'https://www.youtube.com/@vedant' },
    { name: 'linkedin', url: 'https://www.linkedin.com/in/vedant' },
    { name: 'github', url: 'https://github.com/vedant' }
  ];

  return (
    <footer className="mt-12 text-center overflow-x-hidden">
      <AsciiArt />
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
  );
}
