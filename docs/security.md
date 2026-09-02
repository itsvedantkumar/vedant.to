# Security scanning

What runs where, and what to do before shipping and after a deploy. Repo is public
(itsvedantkumar/vedant.to), so treat every gap here as internet-visible.

## Gates

| Tool         | Local gate                            | CI                      | Post-deploy   | Command                                                                  |
| ------------ | ------------------------------------- | ----------------------- | ------------- | ------------------------------------------------------------------------ |
| gitleaks     | yes                                   | yes                     | history sweep | `gitleaks git --log-opts="--all"`                                        |
| semgrep      | yes                                   | yes                     |               | `semgrep ci`                                                             |
| osv-scanner  | yes                                   | yes                     |               | `osv-scanner --lockfile=package-lock.json`                               |
| zizmor       | yes, when `.github/workflows/` exists | yes                     |               | `zizmor .github/workflows`                                               |
| eslint       | yes                                   | yes, `ci.yml` lint step |               | `npm run lint`                                                           |
| npm audit    |                                       | yes                     |               | `npm audit --audit-level=high`                                           |
| nuclei       |                                       |                         | yes           | `nuclei -u <preview-url> -severity medium,high,critical -silent`         |
| ZAP baseline |                                       |                         | yes           | `docker run --rm -t zaproxy/zap-stable zap-baseline.py -t <preview-url>` |

Local gate = `.claude/security-scan.sh`, called from `.claude/verify.sh` on every Stop-hook
check. It prints `ok NAME`, `FAIL NAME`, or `skip NAME (reason)` per tool and exits 1 only if
a tool ran and found something; a missing tool is a skip, not a fail. CI = jobs in
`.github/workflows/security.yml` (gitleaks, semgrep, osv-scanner, zizmor, npm-audit), on pull
request, push to main, and a weekly schedule. Post-deploy = step 5 of `/security`: nuclei and
a ZAP baseline scan against the live `*.vercel.app` preview URL, run by hand after a deploy,
not automated.

## Before ship

```
npm run lint && npm run typecheck && npm test && bash .claude/security-scan.sh
```

Then run `/security` for the full report (adds `npm audit`, a gitleaks history sweep, and a
check that `security.yml` and `dependabot.yml` are wired).

## After deploy

Against the Vercel preview URL for the branch just deployed:

```
nuclei -u <preview-url> -severity medium,high,critical -silent
docker run --rm -t zaproxy/zap-stable zap-baseline.py -t <preview-url>
```

## Repo settings (manual)

Repo is public, so these are free and currently off. Nothing in this repo enables them; they
live under github.com/itsvedantkumar/vedant.to/settings/security_analysis:

- Secret scanning
- Push protection
- CodeQL default setup

## Allowlists

- `.gitleaks.toml`: allowlists the public IndexNow key by commit
  (`2766905b2d5b288e6245d37bc794a78bcc5ddd48`): served at `/<key>.txt` for domain
  verification, public by design, not a leak.
- `eslint.config.mjs`: `security/detect-object-injection` is off. It flags every
  bracket-notation property access regardless of where the key comes from, which drowns out
  real findings on this codebase.
- semgrep ignores go in `.semgrepignore`. None yet.

## Source of truth

`.claude/security-scan.sh` and `.github/workflows/security.yml` are seeded by
`vstack overlay .` from the vstack repo, not hand-maintained here. Fix a bug in the scanner
or the workflow template in vstack, then re-run `vstack overlay .` to pull it in. Once seeded,
`security.yml` is repo-owned: overlay will not clobber local edits, and a later overlay run
reports `kept .github/workflows/security.yml (differs from template)` instead of overwriting.

## Not used and why

- Snyk: paid SaaS scanner; osv-scanner + npm audit cover the same dependency-vuln surface for
  free.
- SonarQube: needs a hosted server; semgrep covers static analysis without one.
- husky / lefthook: git hooks. This repo gates locally through the Claude Stop hook
  (`.claude/verify.sh`), not git hooks.

Follow-up: none of the 12 route handlers under `app/api/**` validate input with a schema
(zod or similar) today; hand-validated. Worth closing separately from tooling.
