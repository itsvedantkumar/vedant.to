# Production-Readiness Audit Prompt (vedant.to)

Run a YC-grade audit of this repo. Be autonomous, fix root causes, keep changes
small and reversible, and prove every claim by building + observing the running app.

## Scope & order

1. **Security (highest priority)**
   - Secrets: nothing real in repo/workflows. `.gitignore` must block every `.env*`
     except `.env.example` / `.env.production` (public-only). Grep the tree for tokens/keys.
   - Auth gates (middleware): constant-time secret comparison, no throw-on-malformed-input
     (wrap `atob`/parsing in try/catch → 401, never 500), correct route `matcher`.
   - Headers (`next.config.mjs`): CSP with no `'unsafe-eval'` on public routes, plus
     `base-uri 'self'`, `form-action 'self'`, `object-src 'none'`, `frame-ancestors 'none'`,
     HSTS preload, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
     Keep the relaxed CSP scoped to `/keystatic` only.
   - Input boundaries: query params bounded/escaped (OG title slice, RSS `escapeXml`),
     external links `rel="noopener noreferrer"`, no `dangerouslySetInnerHTML` on un-highlighted
     user content, no path traversal in fs reads (slug-based file reads).
2. **Code quality (enforce CLAUDE.md)**
   - No `any`, no `console.log`, no dead code/content (delete junk posts/components).
     `catch (e: unknown)` or paramless `catch`. Delete > add.
3. **Performance / Lighthouse**
   - RSC by default; `'use client'` only where needed. Static `revalidate: false` where content
     is build-time. `next/font` (no layout-shift FOUT). Lazy images with dimensions to kill CLS.
     Check First Load JS stays small (<100 kB shared). No render-blocking analytics
     (`strategy="afterInteractive"`).
4. **Analytics / SEO**
   - GA + Vercel Analytics + Speed Insights load without CSP violations. `sitemap.ts`,
     `robots.ts`, `rss.xml`, canonical URLs, OG/Twitter metadata, `metadataBase` all present
     and correct.
5. **CI/CD**
   - Build runs with placeholder Keystatic secrets; real secrets only in Vercel/Actions.
     Deploy step gated on `main` push. No secrets echoed in logs.

## Done bar (do NOT claim done before all pass)

- `npm run build` passes (run it, not just typecheck).
- Reload preview, check `preview_console_logs level=error` → none, snapshot renders content.
- Verify response CSP header via fetch; confirm 200s on `/`, `/blog`, `/blog/[slug]`, `/rss.xml`.
- Commit small + atomic (message = why), push `main`, watch Vercel deploy to READY.
