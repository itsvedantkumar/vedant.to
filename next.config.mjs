import { assetsHost } from './site.config.mjs';

const isProd = process.env.NODE_ENV === 'production';

// Next's dev-only react-refresh runtime evaluates code with eval(), so without
// this nothing hydrates under `npm run dev` — every client component is inert.
// Never emitted in production builds.
const DEV_EVAL = isProd ? '' : " 'unsafe-eval'";

// CSP for every public route. Static: it takes no per-request input, so it
// belongs in a build-time header rather than in the proxy, where producing it
// cost a function invocation on every page view, feed fetch and image request.
// /keystatic and /api/keystatic are excluded here and get a nonce-based policy
// from proxy.ts instead — two CSP headers on one response would be
// intersected by the browser and break the CMS.
const PUBLIC_CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com${DEV_EVAL}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: https://${assetsHost}`,
  "font-src 'self' data:",
  "connect-src 'self' https://va.vercel-scripts.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ZAP baseline flagged `x-powered-by: Next.js` on 404 responses. Nothing needs it.
  poweredByHeader: false,
  pageExtensions: ['ts', 'tsx'],
  // Force-include content files in serverless function bundles.
  // Vercel's NFT can't trace fs.readdir at runtime, so dynamic pages
  // (like /quotes) won't have content files without this.
  outputFileTracingIncludes: {
    '/(.*)?': ['./content/**/*'],
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: assetsHost }],
  },
  async redirects() {
    return [
      {
        source: '/cal',
        destination: 'https://calendar.app.google/nB6tr8kyTD2mwkCa8',
        permanent: false,
      },
      {
        source: '/admin',
        destination: '/keystatic',
        permanent: false,
      },
      {
        source: '/admin/:path*',
        destination: '/keystatic/:path*',
        permanent: false,
      },
      {
        source: '/daily/7th-august-2026',
        destination: '/daily/7-august-2026',
        permanent: true,
      },
    ];
  },
  async headers() {
    // Public CSP is the static PUBLIC_CSP above. Only /keystatic and
    // /api/keystatic get a per-request policy, from proxy.ts, because
    // theirs carries a nonce (that route is force-dynamic, so a fresh nonce
    // every request is safe). Public routes stay on 'unsafe-inline' because
    // they're statically prerendered and a nonce baked into static HTML at
    // build time would never match a later request's — that was tried and
    // reverted once.
    // These are static headers applied on all envs (preview included).
    return [
      {
        // Same exclusions the proxy's matcher used to carry, so the set of
        // responses that carry a public CSP is unchanged: build output, the
        // favicon, /images and /.well-known never had one, and the two
        // keystatic prefixes get theirs from proxy.ts.
        source:
          '/((?!_next/static|_next/image|favicon\\.ico|images/|\\.well-known/|keystatic|api/keystatic).*)',
        headers: [{ key: 'Content-Security-Policy', value: PUBLIC_CSP }],
      },
      {
        source: '/api/keystatic(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          ...(isProd
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains; preload',
                },
              ]
            : []),
        ],
      },
      {
        source: '/keystatic(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          ...(isProd
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains; preload',
                },
              ]
            : []),
        ],
      },
      {
        source: '/admin(.*)',
        headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }],
      },
      {
        source: '/((?!keystatic).*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=(), payment=(), usb=()',
          },
          ...(isProd
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains; preload',
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
