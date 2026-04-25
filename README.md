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

## 📝 How to Use the Built-in CMS (Sanity Studio)

This blog does not use local Markdown files. All content is managed via the Headless CMS.

1. **Access the Dashboard**: Navigate to `vedant.to/write` (or `/write` locally).
2. **Log In**: Authenticate using the Sanity account linked to your Project ID.
3. **Author Content**:
   - Click on the **Post** schema to create a new article.
   - You can write using a rich-text editor that supports code blocks, bold, italics, blockquotes, and lists.
   - Add a Title and click "Generate" next to the Slug field.
4. **Publish**: Once you hit Publish, the Next.js cache is automatically revalidated, and your post is instantly live on the edge.

## 🚀 Running Locally

1. Clone the repository and install dependencies:
```bash
npm install
```

2. Create a `.env.local` file at the root of the project with your Sanity credentials:
```env
NEXT_PUBLIC_SANITY_PROJECT_ID="your_project_id"
NEXT_PUBLIC_SANITY_DATASET="production"
SANITY_AUTH_TOKEN="your_editor_or_admin_token"
SANITY_WEBHOOK_SECRET="your_custom_webhook_secret_string"
```

3. Run the development server:
```bash
npm run dev
```