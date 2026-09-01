# Keystatic authentication

`/keystatic` is effectively git write access to the content repo. It is gated by WebAuthn
passkeys (Touch ID / Face ID / hardware key), with a break-glass password as the recovery
path of last resort.

The reasoning: a human-memorable shared secret is the weakest thing that could guard commit
access, and typing it into the browser's native prompt on every visit is enough friction to
encourage bad habits. Passkeys make the common path a fingerprint and demote the password to
a rarely-touched recovery role.

## Request flow

`middleware.ts` gates everything under `/keystatic` and `/api/keystatic`, in this order:

1. **Fail-closed precheck** — missing `KEYSTATIC_SESSION_SECRET` ⇒ 503 for everyone.
2. **Session cookie** — valid `ks_session` ⇒ pass through.
3. **Rate limit** — unauthenticated requests only (20 per 10 min).
4. **Break-glass Basic Auth** — constant-time password comparison.
5. **Deny** — 307 to `/auth/keystatic` for navigations, 401 JSON for `/api/*`.

The rate limiter sits _behind_ the session check deliberately. Metering every `/keystatic`
request against 20/10min throttled normal editing, because Keystatic's admin UI is chatty. It
now meters login attempts only.

An earlier version of this middleware had a real hole: with `KEYSTATIC_AUTH_PASSWORD` unset it
fell through and left `/keystatic` wide open. The precheck now denies instead.

## Key files

| File                                   | Role                                                            |
| -------------------------------------- | --------------------------------------------------------------- |
| `middleware.ts`                        | The edge gate. Auth-mode switch (`AUTH_MODE` const).            |
| `lib/auth/session.ts`                  | Stateless HMAC-SHA256 `ks_session` cookie. Edge-safe.           |
| `lib/auth/guard.ts`                    | `requireAdmin`, `checkOrigin`, `checkContentType`, rate bucket. |
| `lib/auth/enrollment.ts`               | `enrollmentBlockedReason` — the step-up rule.                   |
| `lib/auth/next-param.ts`               | `safeNext` open-redirect guard for `?next=`.                    |
| `lib/auth/notify.ts`                   | Best-effort email alerts on credential changes.                 |
| `lib/webauthn/config.ts`               | rpID / origin pinning per environment.                          |
| `lib/webauthn/store.ts`                | Redis credential + challenge storage. Owns every `ks:*` key.    |
| `app/api/auth/**`                      | 8 route handlers, all `runtime = 'nodejs'`.                     |
| `app/auth/keystatic/{page,layout}.tsx` | Login UI.                                                       |
| `app/auth/keystatic/enroll/page.tsx`   | Device management.                                              |

`lib/auth/session.ts` uses only Web Crypto and `atob`/`btoa` — nothing Node-specific — because
it runs in Edge middleware. `verifySession` returns `null` on any problem and never throws: an
exception in Edge middleware fails the request unpredictably.

## Design decisions

**Stateless session cookie, not Redis-backed.** Middleware runs on every `/api/keystatic/*`
call and the admin UI is chatty, so a per-request Upstash round-trip would be slow — and an
Upstash outage would become a total lockout. The trade-off is that individual sessions cannot
be revoked. The revocation primitive is rotating `KEYSTATIC_SESSION_SECRET`, which kills every
outstanding session at once. TTL is 12 hours.

**`SameSite=Lax`, not `Strict`.** Keystatic's GitHub OAuth callback arrives as a top-level
cross-site GET. `Strict` would drop the cookie and 401 the handoff.

**One shared `keystatic:pw` rate-limit bucket, inside `requireAdmin`.** Not per-route. A
security review found `/webauthn/credentials` and `/webauthn/register/verify` calling
`requireAdmin` with no limiter attached, which gave an unthrottled brute-force oracle for the
break-glass password via distinguishable status codes. Metering now happens inside
`requireAdmin`, before any comparison, and only when a secret was actually offered.

**Enrollment is passkey step-up, not password-gated.** Once any passkey exists, the break-glass
password can no longer mint a new credential — only an existing passkey-proved session or
`KEYSTATIC_ENROLL_TOKEN` can. Without this, a leaked or guessed password would let an attacker
enroll their own permanent passkey: a foothold that survives rotating the password. The session
cookie's `m` claim (`'passkey' | 'password'`) distinguishes the two, and the rule is enforced
independently at both `/register/options` and `/register/verify`. The cost is that losing every
device means setting `KEYSTATIC_ENROLL_TOKEN` on Vercel to recover — deliberate, since only the
account owner can do that.

**No `WWW-Authenticate` header by default.** It would pop the browser's native prompt instead
of the passkey page. `?basic=1` opts back in for a no-JS emergency.

**Every credential change emails an alert** (`lib/auth/notify.ts`, via the existing Resend
setup): passkey enrolled, passkey removed, break-glass password used. Best-effort — it never
blocks the response. Goes to `KEYSTATIC_ALERT_EMAIL`, falling back to `WHISPER_TO_EMAIL`.

**`checkOrigin` rejects `*.vercel.app` in production**, accepting it only when
`VERCEL_ENV === 'preview'`. Accepting the shared domain in prod would have admitted any
attacker-hosted page on it.

**The login page lives at `/auth/keystatic`, outside the `/keystatic` prefix.** Naming it
`/keystatic/login` would match `startsWith('/keystatic')` and cause a redirect loop.

**`KEYSTATIC_AUTH_MODE` defaults to `basic`** — i.e. exactly the old behaviour. Only the
literal string `passkey` opts in. Shipping the code is deliberately a no-op: if the default
were `passkey`, the deploy would 503 `/keystatic` the moment it landed, before
`KEYSTATIC_SESSION_SECRET` existed on Vercel. Rollback needs no data migration.

## Storing the public key — a landmine

In `lib/webauthn/store.ts`:

```ts
/**
 * base64url of the COSE public key. MUST be a string: Upstash serialises to
 * JSON, and a raw Uint8Array round-trips as {"0":4,"1":167,…} — silently
 * corrupting the key and failing every subsequent assertion.
 */
```

This fails silently and late — enrollment succeeds, and only the next authentication attempt
breaks. Anything binary going into Upstash needs the same treatment.

Challenges are burned atomically with `GETDEL` (`burnChallenge`), so a challenge cannot be
replayed even under concurrent requests.

## Environment variables

| Var                        | Required | Notes                                                                                         |
| -------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `KEYSTATIC_SESSION_SECRET` | yes      | `openssl rand -hex 32`. Missing ⇒ 503 on all `/keystatic`. Rotating it = session kill switch. |
| `KEYSTATIC_AUTH_PASSWORD`  | yes      | Break-glass only. Long, random, in a password manager.                                        |
| `KEYSTATIC_AUTH_MODE`      | no       | **Defaults to `basic`.** Only the literal `passkey` turns passkeys on.                        |
| `KEYSTATIC_ENROLL_TOKEN`   | no       | Bootstrap escape hatch, sent as `x-enroll-token`. Delete once a passkey exists.               |
| `KEYSTATIC_RP_ID`          | no       | Overrides the pinned `vedant.to`.                                                             |
| `KEYSTATIC_ALERT_EMAIL`    | no       | Where credential alerts go. Falls back to `WHISPER_TO_EMAIL`. Needs `RESEND_API_KEY`.         |
| `UPSTASH_REDIS_REST_URL`   | yes      | Credential + challenge storage. WebAuthn routes 503 without it.                               |
| `UPSTASH_REDIS_REST_TOKEN` | yes      | As above.                                                                                     |

Rotate secrets with `gh secret set <NAME>`, then run the `setup-env` workflow to sync them to
Vercel.

## Enrolling a device

1. Unlock at `/auth/keystatic` — passkey, or the break-glass password if no passkey exists yet.
2. Go to `/auth/keystatic/enroll` and add the credential.

If every enrolled device is lost, the password alone is not enough: set
`KEYSTATIC_ENROLL_TOKEN` on Vercel, enroll with it in the `x-enroll-token` header, then delete
the token again.

## Known limitations

- **Clone detection is weak.** The `suspended` flag on signature-counter regression only ever
  fires for hardware keys — iCloud Keychain and Google Password Manager passkeys always report
  `signCount: 0`. Treat it as a signal, not a control.
- **The keystatic CSP still allows `script-src 'unsafe-inline'`.** Pre-existing and out of
  scope here, but it is the main residual risk to cookie confidentiality, and the reason the
  session TTL stays at 12 hours rather than something longer.
- **Preview deploys are a separate credential namespace.** Passkeys enrolled on a
  `*.vercel.app` preview have that rpID and will not work on `vedant.to`. Use the password on
  previews.
- **Origin comparison is a literal string match.** If `www.vedant.to` is ever served, it must
  be added to the `origins` array in `lib/webauthn/config.ts`.
- **Keep at least two passkeys enrolled.** With one, losing that device drops you to the
  break-glass password, and the step-up rule means the password cannot add a replacement — you
  would need `KEYSTATIC_ENROLL_TOKEN`.
