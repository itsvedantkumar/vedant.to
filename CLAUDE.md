# vedant.to — project conventions

## CAVEMAN MODE — MANDATORY, EVERY RESPONSE, NO EXCEPTIONS

Drop: articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries (sure/certainly/of course/happy to), hedging (might/maybe/perhaps/could). Fragments OK. Short synonyms (big not extensive, fix not "implement a solution for"). Technical terms, identifiers, error strings: exact, never abbreviated. Code blocks: normal prose. Pattern: `[thing] [action] [reason]. [next step].`

NOT: "Sure! I'd be happy to help. The issue you're experiencing is likely caused by..."
YES: "Bug in auth middleware. Token expiry check uses `<` not `<=`. Fix:"

Drop caveman ONLY for: security warnings, irreversible-action confirmations. Resume after.

## ORCHESTRATOR MODE — MANDATORY, EVERY NON-TRIVIAL TASK

Act as lean orchestrator. Main thread plans + integrates only — never reads large files or greps repo directly.

Delegate via Agent tool:

- Exploration/search/read-heavy → `subagent_type: "explorer"` (Haiku, cheap)
- Code review → `subagent_type: "code-reviewer"`
- Security → `subagent_type: "security-auditor"`
- Debugging → `subagent_type: "debugger"`
- Tests → `subagent_type: "test-writer"`
- Planning → `subagent_type: "planner"`

Parallelize: independent subtasks → ONE message, multiple Agent calls, concurrent. Serialize only on real dependency. Never parallelize writes to same file. Subagents return tight summary only — no raw file dumps. Skip delegation only for trivial one-step asks.

## CONTEXT SNAPSHOTS — MANDATORY AFTER EVERY MAJOR CHANGE

After every terminal session or significant change (new feature, security fix, refactor, deploy), write a context snapshot to `.claude/context/YYYY-MM-DD-<topic>.md`. Each file captures: what changed, why, key decisions, file:line references, and any open issues.

`.claude/context/` is **gitignored** — snapshots are a local scratchpad, not repo history, and a fresh clone will have none of them. Anything durable (architecture, rationale someone would need six months from now) must be promoted into `docs/` to survive. See `docs/auth.md`, which was promoted out of a snapshot for exactly this reason.

Format:

```
# <topic> — <date>
## What changed
## Why
## Key files (path:line)
## Decisions made
## Open issues / follow-ups
```

---

**Stack:** Next.js 16.3 (App Router, React Server Components), React 19, TypeScript, Tailwind CSS 4. Node 22.

**CMS:** Keystatic. GitHub storage in prod, local in dev. Posts live in `content/posts/*`; post images in `public/images/posts/`. Prefer editing content via `/keystatic`, not by hand, unless asked.

**Deploy:** Direct-to-`main` flow (no PR gate). Vercel's Git integration deploys on push to `main` — deliberately not GitHub Actions, so releases stay independent of Actions quota. `.github/workflows/ci.yml` is validation only (build, normalize-content, format:check, typecheck) and has no deploy step; CI builds with placeholder Keystatic secrets, Vercel rebuilds with real env vars. `setup-env.yml` (manual dispatch) syncs Keystatic secrets to Vercel. The same gate (`npm run check`, prettier, eslint, gitleaks, osv-scanner, zizmor) runs locally as `.githooks/pre-push` (installed by `npm install` via the `prepare` script) and `vercel.json` runs `npm run check` before every Vercel build, so a red check blocks the deploy even when GitHub Actions is unavailable (the account was billing-locked on 2026-09-03). Without Actions, set env vars with `npx --yes vercel@59.1.4 env add NAME production` from a directory linked to the `vedant-blog` project, then `npx --yes vercel@59.1.4 redeploy <prod url>`. Backups and health checks now run on a Cloudflare Worker instead of Actions cron jobs; see docs/ops.md for schedules, deploy, and how to read logs.

**Secrets:** Never hardcode in the repo or workflows. Live in Vercel env + GitHub Actions secrets. `NEXT_PUBLIC_*` vars are inlined into the client bundle at build time, so they must be set on Vercel before build.

**Code:**

- RSC by default; add `'use client'` only when interactivity/hooks needed.
- Tailwind utility classes; match existing styling.
- Keep components small and focused. No new dependencies without a clear need.
- TypeScript strict — no `any` escape hatches without reason.

**Before declaring done:** `npm run build` must pass; run `/code-review` on non-trivial diffs; verify behavior in the running app, not just types.

**Commands:** `npm run dev | build | start`. (CLI tools like node/gh/prettier need a PATH prefix in this environment — see user memory.)
