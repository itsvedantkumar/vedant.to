// Forced dynamic so every request gets a fresh CSP nonce from proxy.ts
// (buildCSP/allow()) that actually matches what's rendered — a statically
// prerendered page would bake in one build-time nonce that could never equal
// a later request's, breaking hydration. Cheap here: /keystatic is an
// authenticated admin tool, not cached/public content.
export const dynamic = 'force-dynamic';

export default function KeystaticLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        :focus-visible { outline: 3px solid #005fcc !important; outline-offset: 2px !important; }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
        }
        @media (forced-colors: active) {
          button, [role="button"] { forced-color-adjust: none; }
        }
      `}</style>
      {children}
    </>
  );
}
