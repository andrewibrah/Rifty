# PR Title
upgrade/security: scrub secrets & add local scanner

## What
- remove committed secrets by dropping the tracked `.env` file and introducing an `example.env` template
- add a repo-owned secret scanning script and hook (`scripts/scan-secrets.js`, `.githooks/pre-commit`)
- surface `npm run scan:secrets` for manual invocation prior to commits

## Why
- Supabase and OpenAI credentials were committed to the repository, violating the zero-secret policy and exposing real keys
- Absent tooling meant future contributors could accidentally recommit secrets

## How
- new template file carries annotated placeholders; `.env` is ignored going forward
- lightweight Node-based scanner inspects staged files for JWTs, `sk-` keys, PEM blocks, and generic API tokens; wired into optional Git hooks via `core.hooksPath`
- new npm script provides a consistent entrypoint for CI/manual checks

## Risks
- Low: developers must configure `git config core.hooksPath .githooks` once to enable automatic scanning
- If additional secret formats emerge, extend `PATTERNS` in `scripts/scan-secrets.js`

## Testing
- `node scripts/scan-secrets.js` (passes with current tree)
- Full validation gates will be executed after stacking PR-2 (type fixes) so `npx tsc --noEmit` succeeds
