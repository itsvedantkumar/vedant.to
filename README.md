# Vedant.to

The personal blog and portfolio of Vedant, engineered for maximum performance, security, and edge-caching capabilities.

## Architecture & Stack

- **Framework**: [Next.js (App Router)](https://nextjs.org)
- **CMS**: [Sanity.io](https://sanity.io)
- **Styling**: [Tailwind CSS](https://tailwindcss.com)
- **Deployment**: [Vercel](https://vercel.com)
- **DNS / Edge Proxies**: [Cloudflare](https://cloudflare.com)

## Quality of Life Features

- **Programmatic SEO:** Dynamic `sitemap.xml`, `rss.xml`, and fully automated Open Graph image generation via `@vercel/og` mapped tightly to the Sanity database.
- **Embedded Studio:** A headless CMS localized natively within the Next.js app at `/studio`.
- **Automated Backups:** A GitHub Actions workflow runs weekly to securely export the entire Sanity dataset, archiving backups locally within the repository to prevent catastrophic data loss.
- **Zero UI Degradation:** By mapping Sanity's `PortableText` schema directly to custom Tailored typography blocks, the aesthetic remains perfectly lean and intact.

## Running Locally

1. Create a Sanity project and configure the Vercel/Sanity API tokens in your environment variables.
2. Run the development server:

```bash
npm install
npm run dev
```