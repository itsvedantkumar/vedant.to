const isProd = process.env.NODE_ENV === 'production';

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['ts', 'tsx'],
  async redirects() {
    return [
      {
        source: '/cal',
        destination: 'https://calendar.app.google/nB6tr8kyTD2mwkCa8',
        permanent: false,
      },
      {
        source: '/keystatic',
        destination: '/admin',
        permanent: true,
      },
      {
        source: '/keystatic/:path*',
        destination: '/admin/:path*',
        permanent: true,
      },
    ];
  },
  async headers() {
    if (!isProd) return [];
    return [
      {
        // Keystatic admin UI needs relaxed CSP for its React editor
        source: '/admin(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
      {
        // Strict security headers for all public-facing routes
        source: '/((?!keystatic|admin).*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https:; font-src 'self' data:; connect-src 'self' https://va.vercel-scripts.com https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none';",
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
