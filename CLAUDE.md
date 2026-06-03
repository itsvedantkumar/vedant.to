# vedant.to — project conventions

**Stack:** Next.js 14.2 (App Router, React Server Components), TypeScript, Tailwind CSS. Node 20.

**CMS:** Keystatic. GitHub storage in prod, local in dev. Posts live in `content/posts/*`; post images in `public/images/posts/`. Prefer editing content via `/keystatic`, not by hand, unless asked.

**Deploy:** Direct-to-`main` flow (no PR gate). Push to `main` → `.github/workflows/deploy.yml` → Vercel. CI builds with placeholder Keystatic secrets; Vercel rebuilds with real env vars. `setup-env.yml` (manual dispatch) syncs Keystatic secrets to Vercel.

**Secrets:** Never hardcode in the repo or workflows. Live in Vercel env + GitHub Actions secrets. `NEXT_PUBLIC_*` vars are inlined into the client bundle at build time, so they must be set on Vercel before build.

**Code:**

- RSC by default; add `'use client'` only when interactivity/hooks needed.
- Tailwind utility classes; match existing styling.
- Keep components small and focused. No new dependencies without a clear need.
- TypeScript strict — no `any` escape hatches without reason.

**Before declaring done:** `npm run build` must pass; run `/code-review` on non-trivial diffs; verify behavior in the running app, not just types.

**Commands:** `npm run dev | build | start`. (CLI tools like node/gh/prettier need a PATH prefix in this environment — see user memory.)
