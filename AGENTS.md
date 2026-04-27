# Agent Documentation for vedant-blog

## General Guidelines
* The repository is a personal blog for 'Vedant', deployed on the domain `vedant.to`.
* The project name is `vedant-blog` and must not contain any legacy 'next-mdx-blog' template branding.
* The user requires the codebase to be kept as lean as possible and prioritizes strict security with no vulnerabilities.
* The user prefers to only use completely free features and tools for any additions or quality of life improvements.
* The user strictly requires preserving existing UI styling when adding new features or altering architecture.

## Architecture and Stack
* The project architecture is built using **Next.js App Router**, relies on **Sanity.io** as a headless CMS, and is deployed via **Vercel** and **Cloudflare** edge networks.
* The blog is structured to be deployed at `/blog` for the blog index, and `/blog/(slug)` for individual articles.
* The built-in Sanity CMS studio interface is accessed via the `/write` route.

## Component Details
* The Mascot animation component relies on direct DOM updates via `useRef` to maintain 60FPS performance without triggering unnecessary React renders.

## Dependencies and Build
* To install dependencies, use `npm install`.
* To build the project, use `npm run build`.

## Styling
* The project uses **Tailwind CSS v3**.
* **Avoid** using the `@tailwindcss/typography` plugin or generic `.prose` classes, as they override and break the custom MDX component styling.

## Security
* API keys and secrets must **never** be hardcoded; they must be strictly managed securely via environment variables or GitHub Secrets.

## Deployment & Secrets
* Vercel deployment via GitHub Actions requires the secrets `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_TOKEN`, `SANITY_AUTH_TOKEN`, `NEXT_PUBLIC_SANITY_PROJECT_ID`, and `NEXT_PUBLIC_SANITY_DATASET` to be configured in the repository.
* Manual deployments to Vercel can be triggered locally bypassing GitHub Actions using the Vercel CLI with the commands `npx vercel build --prod` and `npx vercel deploy --prebuilt --prod` alongside the `VERCEL_TOKEN`.
* The project utilizes GitHub Actions to execute automated daily backups of the CMS data.
* Code must be pushed using the platform's `submit` tool rather than running `git push` directly in the terminal, due to sandbox authentication restrictions.

## Testing
* The project uses Playwright (e.g., `verify_mascot.py`) for local frontend and visual verification testing.
