# Runbook — upgrade/security

## Deploy Steps
1. Copy `example.env` to `.env.local` (or environment-specific file) and fill real values.
2. Point Git to the committed hook directory: `git config core.hooksPath .githooks`.
3. Run the scanner manually if hooks are not enabled: `npm run scan:secrets`.
4. Proceed with regular release flow.

## Validation
- `node scripts/scan-secrets.js`

(Full lint/type/test/smoke suite will run after type errors are resolved in PR-2.)

## Rollback
1. Remove the hook path override: `git config --unset core.hooksPath`.
2. Delete `scripts/scan-secrets.js`, `.githooks/pre-commit`, and `example.env` if undesired.
3. Restore previous `.env` handling from backup.
