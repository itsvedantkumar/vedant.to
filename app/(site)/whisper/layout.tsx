export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function WhisperLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
