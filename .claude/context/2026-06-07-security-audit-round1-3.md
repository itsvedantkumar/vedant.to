# Security Audit (Rounds 1–3) — 2026-06-07

## What changed
Full intensive security audit + fix pass across the entire vedant.to repo. Three rounds of 10 parallel sub-agents each.

## Why
User requested comprehensive security hardening before continued development.

## Key files (path:line)

### middleware.ts
- Expanded matcher to all routes (not just keystatic) for nonce generation
- `buildCSP(nonce, isKeystatic)` generates per-request CSP with nonce
- Removed `x-real-ip`; only uses `x-vercel-forwarded-for`
- Constant-time compare pads both sides to maxLen
- Rate limiter fails-closed (503) in prod when Upstash null

### next.config.mjs
- CSP removed (middleware handles it now)
- Static headers (HSTS, X-Content-Type-Options, X-Frame-Options DENY, etc.) apply on all envs
- img-src restricted to explicit hosts; form-action added

### app/layout.tsx
- Made async; reads nonce from `x-nonce` header via `headers()`
- Passes nonce to GA Script tags and JSON-LD inline script
- JSON-LD escapes `<` → `<`
- Removed hardcoded GA ID fallback

### app/(site)/page.tsx
- Bio updated to: "I'm a contrarian chasing polymathy / I love watching movies, listening to music, and absorbing culture / Other than that, I plan to dedicate my life to advancing human civilisation"

### app/api/upload/route.ts
- WEBP RIFF prefix check (bytes 0–3)
- GIF 6-byte check (GIF87a/GIF89a)
- Content-Length pre-check before formData()
- Upstash rate limiting (10 req/hr)
- PENDING: timing-safe compare still has `a.byteLength !== b.byteLength` fast-path (line 44)
- PENDING: x-real-ip fallback in rate-limit IP getter (line 66)

### app/api/whisper/route.ts
- `x-real-ip` removed from `getIP()`
- IP format validated via regex before proxycheck.io URL
- `crypto.randomUUID().replace(/-/g,'').slice(0,8)` for filename
- PENDING: token burn `ex: 1800` should be `TOKEN_TTL_MS/1000 + 60` (1860)

### app/api/og/route.tsx
- Rate limiting added (60 req/min, edge-compatible Upstash)
- PENDING: partial-config Upstash guard (one var set, one missing = silently null)

### app/(site)/blog/[slug]/page.tsx
- JSON-LD escapes `<`
- `generateMetadata` has try/catch returning `{}`
- coverImage uses `startsWith('https://')` for metadata/schema
- PENDING: coverImage guard on `<Image src={post.coverImage}>` (line 109) — SSRF risk
- PENDING: http:// coverImage produces malformed URL in metadata

### app/feed.json/route.ts
- PENDING: `startsWith('http')` → `startsWith('https://')` for coverImage

### app/(site)/blog/[slug]/error.tsx
- PENDING: `console.error(error)` → `console.error('[blog-error]', error.digest ?? error.message)`

### lib/renderers.tsx
- Link renderer validates protocol via `new URL()` against SAFE_PROTOCOLS
- Invalid hrefs collapse to `#`

### lib/reading-time.ts
- PENDING: slug sanitization guard before path construction

### scripts/normalize-content.mjs
- `splitByFencedCode()` added; normalizeBody skips code segments
- PENDING: `processed.join('')` at line 245 should be `processed.join('\n')` — content corruption bug

### scripts/normalize-images.mjs
- Path traversal guard; collision check before rename; safe alt-text extraction

### scripts/sync-images-to-r2.mjs
- `.env.local` quote stripping; metadata-based dedup; per-file try/catch

### scripts/restore.sh
- mktemp extraction; zip entry pre-validation via `unzip -l`
- PENDING: add `--` to unzip calls

### tsconfig.json
- `.claude` and `.claude/**` added to exclude array

### package.json
- `autoprefixer` moved to devDependencies; `overrides` block removed

### .env.example
- 9 missing vars added; PENDING: VERCEL_TOKEN CI-only warning comment

### public/.well-known/security.txt
- Created with Contact, Expires (2027-06-07), Preferred-Languages, Canonical

### .github/workflows/
- All 9 workflows SHA-pinned; concurrency on deploy/lighthouse/indexnow/secret-scan/security-audit
- PENDING: concurrency on backup.yml, health.yml, links.yml

### CLAUDE.md (project)
- Added CAVEMAN MODE, ORCHESTRATOR MODE, CONTEXT SNAPSHOTS sections

## Decisions made
- Nonce-based CSP via middleware (not next.config headers) — only way to pass nonce to RSC
- Fail-closed for all rate limiters in prod (503 > silent pass-through)
- Only `x-vercel-forwarded-for` for IP — `x-real-ip` is client-spoofable off Vercel
- Magic-byte validation on upload (not just MIME type sniffing)
- HMAC-SHA256 proof tokens for Whisper anti-spam (30-min TTL, 15s min-age bot check)

## Open issues / follow-ups
All PENDING items above still need fixes. See conversation summary for full list.

## Prod env vars missing (Vercel dashboard — not code bugs)
- `KEYSTATIC_AUTH_PASSWORD` → Keystatic 503
- `WHISPER_TOKEN_SECRET` → Whisper "something went wrong"
