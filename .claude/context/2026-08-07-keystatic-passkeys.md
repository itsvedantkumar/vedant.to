# keystatic passkey login — 2026-08-07

## What changed

Replaced the HTTP Basic Auth prompt on `/keystatic` with WebAuthn passkeys (Touch ID / Face ID / security key). The password survives as break-glass only.

- `middleware.ts` — rewritten gate. Order is now: fail-closed precheck → session cookie → rate limit (unauthenticated only) → break-glass Basic → deny (307 to the login page for navigations, 401 JSON for `/api/*`).
- `lib/auth/session.ts` — stateless HMAC-SHA256 session cookie (`ks_session`), Edge-safe (Web Crypto + `atob`/`btoa` only, nothing else).
- `lib/auth/guard.ts` — `requireAdmin`, `checkOrigin`, `checkContentType`, and the single shared password/token rate-limit bucket.
- `lib/auth/next-param.ts` — `safeNext` open-redirect guard for `?next=`.
- `lib/webauthn/config.ts` — rpID/origin pinning per environment, user-handle constant.
- `lib/webauthn/store.ts` — Redis credential + challenge storage; owns every `ks:*` key.
- `app/api/auth/**` — 8 route handlers (status, password, logout, webauthn register options/verify, authenticate options/verify, credentials list/revoke). All `runtime = 'nodejs'`.
- `app/auth/keystatic/{page,layout}.tsx` and `app/auth/keystatic/enroll/page.tsx` — login and device-management UI.
- `package.json` — `@simplewebauthn/server` + `@simplewebauthn/browser` ^13.3.0.
- `.env.example`, `.github/workflows/setup-env.yml` — three new env vars.

Also fixed a real pre-existing hole: with `KEYSTATIC_AUTH_PASSWORD` unset, the old middleware fell through and left `/keystatic` **wide open** (old `middleware.ts:96-99`). It now denies.

## Why

Typing a password into the browser's native prompt every time is friction, and a human-memorable shared secret is the weakest thing guarding what is effectively git write access to the content repo. Passkeys make the common path a fingerprint; the password moves to a rarely-touched recovery role.

## Key files (path:line)

- `middleware.ts:87` — `middleware()`; `:104` fail-closed precheck; `:113` session check; `:120` rate limit; `:133` break-glass; `:136` deny paths.
- `lib/auth/session.ts:83` — `verifySession`, returns `null` on any problem, never throws (an exception in Edge middleware fails the request unpredictably).
- `lib/auth/guard.ts:26` — shared `keystatic:pw` bucket; `:47` `limitSecretAttempt`; `:96` `requireAdmin`.
- `lib/webauthn/store.ts:24` — why `publicKey` is stored base64url and not a `Uint8Array`; `:118` `burnChallenge` (atomic `GETDEL`).
- `app/api/auth/webauthn/authenticate/verify/route.ts:80` — counter-regression → suspend credential.
- `app/api/auth/webauthn/credentials/route.ts:57` — last-credential lockout guard, unlink-then-restore to avoid a TOCTOU race.

## Decisions made

- **Stateless session cookie, not Redis-backed.** Middleware runs on every `/api/keystatic/*` call and Keystatic's UI is chatty; a per-request Upstash round-trip would be slow, and an Upstash outage would become a total lockout. Trade-off: individual sessions can't be revoked. The revocation primitive is rotating `KEYSTATIC_SESSION_SECRET`, which kills every session at once. TTL 12h.
- **`SameSite=Lax`, not `Strict`.** Keystatic's GitHub OAuth callback arrives as a top-level cross-site GET; `Strict` would drop the cookie and 401 the handoff.
- **Rate limiter moved behind the session check.** Previously every `/keystatic` request counted against 20/10min, which the admin UI can exceed during normal editing. It now meters login attempts only.
- **No `WWW-Authenticate` header by default** — it would pop the native prompt instead of the passkey page. `?basic=1` opts back in for a no-JS emergency.
- **One shared `keystatic:pw` bucket inside `requireAdmin`**, not per-route. A security review found that `/webauthn/credentials` and `/webauthn/register/verify` called `requireAdmin` with no limiter, giving an unthrottled brute-force oracle for the break-glass password via distinguishable status codes. Metering happens inside `requireAdmin` before any comparison, and only when a secret was actually offered.
- **Enrollment is passkey step-up, not password-gated** (`lib/auth/enrollment.ts`). Once any passkey exists, the break-glass password can no longer mint a new credential — only an existing passkey-proved session or `KEYSTATIC_ENROLL_TOKEN` can. Rationale: a leaked or guessed password would otherwise let someone enroll their own permanent passkey, a foothold that survives rotating the password. The session cookie's `m` claim (`'passkey' | 'password'`) is what distinguishes the two. Enforced independently at both `/register/options` and `/register/verify`. Cost: losing every device means setting `KEYSTATIC_ENROLL_TOKEN` on Vercel to recover — deliberate, since only the account owner can do that.
- **Every credential change emails an alert** (`lib/auth/notify.ts`, via the existing Resend setup): passkey enrolled, passkey removed, break-glass password used. Best-effort, never blocks the response. Goes to `KEYSTATIC_ALERT_EMAIL`, falling back to `WHISPER_TO_EMAIL`.
- **`checkOrigin` no longer accepts `*.vercel.app` in production**, only when `VERCEL_ENV === 'preview'`. Accepting the shared domain in prod would have admitted an attacker-hosted page on it.
- **Login page lives at `/auth/keystatic`, deliberately outside the `/keystatic` prefix.** Naming it `/keystatic/login` would match `startsWith('/keystatic')` and cause a redirect loop.
- **`KEYSTATIC_AUTH_MODE` defaults to `basic`**, i.e. the old behaviour exactly; only the literal `passkey` opts in. Shipping the code is deliberately a no-op — if the default were `passkey`, the deploy would 503 `/keystatic` the moment it landed, since `KEYSTATIC_SESSION_SECRET` does not exist on Vercel yet. Rollback needs no data migration.

## New env vars

| Var | Required | Notes |
|---|---|---|
| `KEYSTATIC_SESSION_SECRET` | yes | `openssl rand -hex 32`. Missing ⇒ 503 on all `/keystatic`. Rotating it = session kill switch. |
| `KEYSTATIC_ENROLL_TOKEN` | no | Bootstrap escape hatch (`x-enroll-token`). Delete once a passkey exists. |
| `KEYSTATIC_AUTH_MODE` | no | **Defaults to `basic`.** Only the literal `passkey` turns passkeys on. Deploying the code is a no-op until it is set. |
| `KEYSTATIC_RP_ID` | no | Overrides the pinned `vedant.to`. |

## Verified

`enrollmentBlockedReason` has direct assertions covering all nine bootstrap/step-up cases (run with `node --experimental-strip-types` against `lib/auth/enrollment.ts`). Over HTTP: `/webauthn/register/options` → 401 unauthenticated and with a wrong password, 415 without a JSON content-type, 403 from a `*.vercel.app` origin; `/webauthn/register/verify` rejects a forged challenge cookie before any password comparison.

`npm run typecheck` and `npm run build` pass (build needs placeholder Keystatic secrets locally — pre-existing). Against `next dev`: unauthenticated navigation → 307 to the login page; `/api/keystatic/*` → 401 JSON; password login sets the cookie and grants access; wrong password → 401; forged/tampered/garbage cookies all rejected; `Origin: https://evil.example` → 403; missing `KEYSTATIC_SESSION_SECRET` → 503 everywhere; `KEYSTATIC_AUTH_MODE=basic` reproduces the old 401 + `WWW-Authenticate` behaviour; `/api/auth/webauthn/*` → 503 with no Redis; credentials endpoint → 401 unauthenticated and with a bad password.

## Rollout state — COMPLETE as of 2026-08-08

Passkeys are **live and enforcing** on `vedant.to/keystatic`. Rollout ran to completion in one session:

| Step | State |
|---|---|
| Code shipped to `main` | `41cc6df`, deployed via Vercel |
| `KEYSTATIC_SESSION_SECRET` | generated, GitHub Actions secret, synced to Vercel prod + preview |
| `KEYSTATIC_AUTH_PASSWORD` | **rotated** (old value was unrecoverable — GitHub secrets are write-only) |
| `KEYSTATIC_AUTH_MODE` | `passkey` |
| `KEYSTATIC_ENROLL_TOKEN` | unset — not needed, bootstrap went through the password |
| Passkeys enrolled | **1** (see follow-ups) |

Verified against production after the flip:

```
GET  /keystatic          (no session)   → 307 → /auth/keystatic?next=%2Fkeystatic
GET  /keystatic          (session)      → 200
GET  /keystatic          (Basic + pw)   → 200   break-glass intact
GET  /api/keystatic/...  (no session)   → 401
GET  /                                  → 200
POST /api/auth/password                 → 200 + Set-Cookie
```

End-to-end proof beyond curl: commit `e081e0d` (`Update content/daily/7-august-2026`) was authored through the Keystatic UI behind the passkey gate.

Upstash turned out to be already configured in production, which is why the WebAuthn round-trip — untestable locally, since every value in `.env.local` is empty — could be exercised for real against prod.

## Open issues / follow-ups

- **Only ONE passkey is enrolled.** If that device is lost, the break-glass password is the only way in. Add a second (iPhone via cross-device QR, or a hardware key): unlock at `/auth/keystatic`, then `/auth/keystatic/enroll`. The password cannot add it — the step-up rule requires an existing passkey session.
- **`KEYSTATIC_AUTH_PASSWORD` was disclosed in a chat transcript** during rollout (it had to be, to bootstrap the first passkey). It should be rotated again once a second device is enrolled, at which point nobody needs to know its value — it is read out of Vercel only if every authenticator is lost. Rotate via `gh secret set KEYSTATIC_AUTH_PASSWORD` then run the `setup-env` workflow.
- `gh` operations on this repo require `gh auth switch --user itsvedantkumar`; the active account otherwise reverts to `vedant-simulacrum`, which 404s. A `gh secret set` under the wrong account fails with a 404 that is easy to mistake for success if the exit code is not checked.
- The `Security Audit` workflow fails on a `nanoid` high-severity advisory reached through `@keystatic/core → @toeverything/y-indexeddb`. Unrelated to this work — the advisory was published between commits, and the lockfile diff here touches only the two `@simplewebauthn` packages. Dependabot has a PR open.
- Clone detection (`suspended` flag on counter regression) only ever fires for hardware keys — iCloud Keychain and Google Password Manager passkeys always report `signCount: 0`. Not a primary control.
- The keystatic CSP still allows `script-src 'unsafe-inline'`. Pre-existing, out of scope, but it is the main residual risk to cookie confidentiality and the reason the session TTL stays at 12h.
- Passkeys enrolled on a Vercel preview deploy have a `*.vercel.app` rpID and will not work on `vedant.to`. Use the password on previews.
- If `www.vedant.to` is ever served, add it to the `origins` array in `lib/webauthn/config.ts` — origin comparison is a literal string match.
