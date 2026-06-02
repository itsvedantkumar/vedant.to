import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import Script from 'next/script';

const inter = Inter({ subsets: ['latin'] });

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

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
        {/* Vercel Speed Insights — injected by Vercel's edge network when deployed */}
        <Script src="/_vercel/speed-insights/script.js" strategy="afterInteractive" />
        {/* Google Analytics */}
        {GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_ID}');
              `}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
