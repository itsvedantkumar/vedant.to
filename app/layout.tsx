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
        {children}
        <Analytics />
      </body>
    </html>
  );
}
