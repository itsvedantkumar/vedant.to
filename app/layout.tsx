import './globals.css';
import type { Metadata } from 'next';

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
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
