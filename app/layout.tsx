import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import Script from 'next/script';
import { siteSchema } from '@/lib/json-ld';
import { EasterEgg } from '@/components/easter-egg';

const inter = Inter({ subsets: ['latin'] });

const GA_ID = 'G-RDWCGNBH9B';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#09090b',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://vedant.to'),
  title: {
    default: 'Vedant',
    template: '%s',
  },
  description: "Hi I'm Vedant",
  authors: [{ name: 'Vedant Kumar', url: 'https://vedant.to' }],
  creator: 'Vedant Kumar',
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
    images: [{ url: 'https://vedant.to/icon.png', width: 512, height: 512 }],
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@itsvedantkumar',
    images: ['https://vedant.to/icon.png'],
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteSchema()) }}
        />
        {children}
        <EasterEgg />
        <Analytics />
        {/* Google tag (gtag.js) */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga-init" strategy="afterInteractive">
          {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');`}
        </Script>
      </body>
    </html>
  );
}
