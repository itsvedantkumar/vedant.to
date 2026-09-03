import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { siteSchema, person } from '@/lib/json-ld';
import { ogImageUrl, FEED_TYPES } from '@/lib/metadata';
import { EasterEgg } from '@/components/easter-egg';
import {
  SITE_URL,
  SITE_NAME,
  AUTHOR,
  TWITTER_HANDLE,
  SITE_DESCRIPTION,
} from '@/lib/constants';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#09090b',
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  authors: [{ name: person.name, url: person.url }],
  creator: AUTHOR,
  alternates: { types: FEED_TYPES },
  openGraph: {
    siteName: SITE_NAME,
    locale: 'en_US',
    type: 'website',
    images: [{ url: ogImageUrl(SITE_NAME), width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    creator: TWITTER_HANDLE,
    images: [ogImageUrl(SITE_NAME)],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Escape </script> breakout vectors in JSON-LD
  const siteJsonLd = JSON.stringify(siteSchema()).replace(/</g, '\\u003c');

  return (
    <html lang="en" className={inter.className}>
      <body className="antialiased tracking-tight">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: siteJsonLd }}
        />
        {children}
        <EasterEgg />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
