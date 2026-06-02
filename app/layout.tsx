import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';

const inter = Inter({ subsets: ['latin'] });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#09090b',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://vedant.to'),
  title: {
    default: 'Vedant',
    template: '%s | Vedant',
  },
  description: 'Builder, writer, curious person. Writing about products, software, and ideas.',
  openGraph: {
    siteName: 'Vedant',
    locale: 'en_US',
    type: 'website',
    images: [{ url: 'https://vedant.to/api/og?title=Vedant', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@itsvedantkumar',
    images: ['https://vedant.to/api/og?title=Vedant'],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.className}>
      <body className="antialiased tracking-tight">
        <div className="min-h-screen flex flex-col justify-between pt-0 md:pt-8 p-8 dark:bg-zinc-950 bg-white text-gray-900 dark:text-zinc-200">
          <main className="max-w-[60ch] mx-auto w-full space-y-6">
            {children}
          </main>
          <Footer />
          <Analytics />
        </div>
      </body>
    </html>
  );
}

function Footer() {
  const links = [
    { name: 'github', url: 'https://github.com/itsvedantkumar' },
    { name: '@itsvedantkumar', url: 'https://x.com/itsvedantkumar' },
    { name: 'linkedin', url: 'https://www.linkedin.com/in/itsvedantkumar' },
  ];

  return (
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
  );
}
