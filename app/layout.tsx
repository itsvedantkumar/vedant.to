import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { siteSchema, person } from '@/lib/json-ld';
import { ogImageUrl } from '@/lib/metadata';
import { EasterEgg } from '@/components/easter-egg';
import { SITE_URL, SITE_NAME, AUTHOR, TWITTER_HANDLE } from '@/lib/constants';

const inter = Inter({ subsets: ['latin'], display: 'swap' });
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#09090b',
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Vedant',
    template: '%s — Vedant',
  },
  description: "Hi I'm Vedant",
  authors: [{ name: person.name, url: person.url }],
  creator: AUTHOR,
  alternates: {
    types: {
      'application/rss+xml': '/rss.xml',
      'application/feed+json': '/feed.json',
    },
  },
  openGraph: {
    siteName: 'Vedant',
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
        {process.env.NODE_ENV === 'production' && GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script src="/ga-init.js" strategy="afterInteractive" data-ga-id={GA_ID} />
          </>
        )}
      </body>
    </html>
  );
}
