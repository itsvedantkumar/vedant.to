# vedant.to — Session Context

> Compact log of decisions, fixes, and state across Claude sessions. Append each session's changes at top.

---

## 2026-06-07

### CI Failures — Root Causes & Fixes

**Production Health (repeated failures ~21:57 Jun 6 → 10:06 Jun 7)**

- Cause: `/search-index.json` returning 404; route was deleted from the site but still in `ROUTES` list in health check workflow.
- Fix: commit "fix: remove deleted /search-index.json from health check routes" pushed ~11:51. Run at 12:16 succeeded. ✅ Already resolved.

**Daily Content Backup (02:05 Jun 7)**

- Cause: `R2_ENDPOINT` secret was empty/not set. Guard `if: env.R2_ACCESS_KEY_ID != ''` passed (key was set), but `R2_ENDPOINT` was step-level-only env so the aws call got `--endpoint-url ""` → `scheme is missing` error.
- Fix: promoted `R2_ENDPOINT` to job-level env, added `&& env.R2_ENDPOINT != ''` to the guard condition. R2 step now skips cleanly when endpoint isn't configured.
- File: `.github/workflows/backup.yml`

### Architectural Notes

- Deploy: push to `main` → Vercel (no PR gate). CI runs on PRs + pushes.
- Secrets: live in Vercel env + GitHub Actions secrets. Never hardcode.
- R2 backup is optional/off-GitHub cold storage — all required secrets (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET`) must be set together.
- Health check workflow polls `https://vedant.to` routes on a schedule; any 404 fails the run.

---

<!-- Template for future sessions:
## YYYY-MM-DD
### What changed
### Why
### Files touched
-->
