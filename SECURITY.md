# Security Policy

## Reporting a vulnerability

Found a security issue in [vedant.to](https://vedant.to)? Please report it
privately rather than opening a public issue.

- **Email:** vk.work.official@gmail.com
- Or open a [private security advisory](https://github.com/itsvedantkumar/vedant.to/security/advisories/new).

Please include steps to reproduce and the affected URL or component. You'll get
an acknowledgement within 72 hours.

## Supported versions

This is a continuously deployed site. Only the current `main` (live production)
is supported. There are no released versions to back-port fixes to.

## Hardening in place

- **HTTP security headers** on all public routes: CSP, HSTS (2y, preload),
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`,
  `frame-ancestors 'none'`.
- **Admin gate:** `/keystatic` CMS UI is behind WebAuthn passkeys, with a
  constant-time break-glass password as the recovery path (Basic Auth is only
  the fallback when `KEYSTATIC_AUTH_MODE` is not `passkey`). Sessions are
  signed, 12h, and revoked en masse by rotating the signing secret. See
  [docs/auth.md](docs/auth.md).
- **Rate limiting** (Upstash Redis) on every abusable endpoint: admin login,
  passkey enrollment, image upload, OG rendering, and `/api/whisper`.
- **Whisper anti-abuse:** submissions need an HMAC proof-of-page-load token
  (30min TTL, 3s minimum age, burned on use), are capped at 3 per IP per 24h,
  and are screened for proxy/VPN origin via proxycheck.io.
- **Secrets** live only in Vercel env + GitHub Actions secrets, never committed.
  `NEXT_PUBLIC_*` values are public by design.
- **Dependency scanning:** Dependabot alerts + weekly `npm audit` CI
  (`security-audit.yml`), failing on high/critical advisories.
- **Secret scanning:** `gitleaks` runs on every push/PR and weekly over full
  history (`secret-scan.yml`).
- **Least-privilege CI:** every workflow declares minimal `permissions:`.
