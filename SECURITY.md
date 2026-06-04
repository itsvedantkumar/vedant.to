# Security Policy

## Reporting a vulnerability

Found a security issue in [vedant.to](https://vedant.to)? Please report it
privately rather than opening a public issue.

- **Email:** security@vedant.to
- Or open a [private security advisory](https://github.com/itsvedantkumar/vedant.to/security/advisories/new).

Please include steps to reproduce and the affected URL or component. You'll get
an acknowledgement within 72 hours.

## Supported versions

This is a continuously deployed site — only the current `main` (live production)
is supported. There are no released versions to back-port fixes to.

## Hardening in place

- **HTTP security headers** on all public routes: CSP, HSTS (2y, preload),
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`,
  `frame-ancestors 'none'`.
- **Admin gate:** `/keystatic` CMS UI is behind constant-time Basic Auth.
- **Secrets** live only in Vercel env + GitHub Actions secrets — never committed.
  `NEXT_PUBLIC_*` values are public by design.
- **Dependency scanning:** Dependabot alerts + weekly `npm audit` CI
  (`security-audit.yml`), failing on high/critical advisories.
- **Secret scanning:** `gitleaks` runs on every push/PR and weekly over full
  history (`secret-scan.yml`).
- **Least-privilege CI:** every workflow declares minimal `permissions:`.
