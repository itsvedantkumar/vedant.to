const isProd = process.env.NODE_ENV === 'production';

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['ts', 'tsx'],
  // Force-include content files in serverless function bundles.
  // Vercel's NFT can't trace fs.readdir at runtime, so dynamic pages
  // (like /quotes) won't have content files without this.
  outputFileTracingIncludes: {
    '/(.*)?': ['./content/**/*'],
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'assets.vedant.to' }],
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
    // CSP is set per-request by middleware (nonce-based) — not here.
    // These are static headers applied on all envs (preview included).
    return [
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
