Purpose
Upgrade the codebase to an industry-grade, warning-free, test-backed release while preserving behavior. Execute in small, auditable PRs with runbooks and rollback paths.

Priorities
P0 – Security & Stability (now)

P1 – Correctness & Structure

P2 – Testing & Developer Experience

P3 – Docs & Contributor Flow

P0 — Security & Stability
1) Secrets Hygiene
Changes

Add example.env with annotated placeholders.

Add .env.local to .gitignore.

Add pre-commit secret scanning (gitleaks or hush).

Search & scrub committed secrets; replace with runtime env reads.

Acceptance

No secrets in repo or staged commits.

gitleaks protect --staged passes.

Commands

bash
Copy code
echo -e "SUPABASE_URL=\nSUPABASE_ANON_KEY=\nOPENAI_API_KEY=\nAPP_ENV=development" > example.env
npx gitleaks detect --no-banner || true
Rollback

Revert PR; restore previous env handling.

2) Type Safety Hardening
Changes

Enable TS strictness (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, noImplicitOverride).

Replace any in agent/router/native bridges with discriminated unions and zod guards at boundaries.

Add exhaustive switches for intent labels.

Acceptance

npx tsc --noEmit exits 0.

Zero // @ts-ignore newly introduced.

Commands

bash
Copy code
npx tsc --noEmit
Rollback

Back out strict flags file-by-file via targeted tsconfig overrides.

3) Swift↔JS Intent Bridge Contract
Changes

Define IntentPayload in TS:

ts
Copy code
export type IntentPayload = { label: string; top3: {label:string; confidence:number}[] }
Guard decoder in src/native/intent.ts using zod.

Ensure Swift always resolves with this shape; wrap DispatchWorkItem and use DispatchQueue.global(...).async(execute: work).

Acceptance

Runtime bridge call never returns undefined/mismatched shapes.

Typecheck passes where payload is used.

Rollback

Keep previous adapter as fallback; feature-flag via env NATIVE_INTENT_V1.

4) Menu Query Latency (3×1000 rows)
Changes

Paginate to 100/page with cursor.

Memoize selectors; avoid redundant re-fetch.

Acceptance

Initial menu load < 300ms in dev (local DB).

No more than 1 query per refresh unless user paginates.

Rollback

Keep old fetch path behind USE_MENU_PAGINATION=false.

5) CI/Tooling Strictness
Changes

Add scripts: typecheck, lint, test, smoke.

Configure CI to fail on warnings (ESLint/TS).

Pin Node/Expo/TS versions.

Acceptance

Local gates green and reproducible.

CI job fails on any warning or test failure.

Rollback

Toggle STRICTNESS=balanced gate in CI for hotfixes.

P1 — Correctness & Structure
6) Split App.tsx into Modules
Changes

Extract AppShell, Providers, Navigator, MainChatScreen.

No behavior change; isolated refactor.

Acceptance

App boots; smoke script passes.

Cyclomatic complexity ↓; file LOC < 300 each.

Rollback

Revert module split; keep shim exports for compatibility.

7) Runtime Validation at Edges
Changes

Add zod schemas for inputs/outputs at: router entries, Edge Function requests, Supabase writes.

Acceptance

Invalid data throws typed errors; caught and surfaced gracefully.

Logs show normalized error paths, not crashes.

Rollback

Feature-flag validation layer via VALIDATION_ON=false.

8) Intent Enum + Exhaustive Handling
Changes

Central IntentLabel enum + map; router uses exhaustive switch; dead default removed.

Acceptance

Adding a new intent breaks compile until handled.

Rollback

Keep legacy string paths behind adapter map.

P2 — Testing & DX
9) Test Harness + Coverage
Changes

Add Vitest + React Testing Library.

Unit tests for router, agent planners, native bridge adapter.

Contract tests for Edge Function with sample payloads.

Snapshot tests for prompt assembly.

Acceptance

Coverage ≥ 75%.

npm test exits 0 locally.

Rollback

Mark flaky tests it.skip and log in FINDINGS.json.

10) Smoke Script
Changes

scripts/smoke.js: boot app, create journal entry, run classifier mock, assert UI update, write exit code.

Acceptance

npm run smoke returns 0.

Rollback

Keep script noop; log TODO.

11) Accessibility Minimums (if UI screens present)
Changes

Add roles/labels; focus order; avoid low-contrast text.

Acceptance

No critical a11y warnings in devtools checks.

Rollback

Revert individual components if regressions appear.

P3 — Docs & Contributor Flow
12) Repo Docs
Changes

README quickstart; CONTRIBUTING; COMMANDS.md; RISK_LOG.md; CHANGELOG.md.

ADR: “On-device Intent + Edge Function design”.

Acceptance

New dev can run the app with 5 commands.

Rollback

None; docs are additive.

PR Plan (order & contents)
PR-1: Security & Secrets

example.env, .gitignore updates, pre-commit hook, secret scan config.

Runbook: how to rotate keys if any were exposed.

PR-2: Type Strictness

tsconfig strict flags, fix high-noise any sites, add intent types.

PR-3: Native Bridge Contract

TS IntentPayload, zod guard, Swift resolve shape guarantee.

PR-4: Menu Pagination Perf

Cursor pagination + memoization; env flag to toggle.

PR-5: App Shell Split

Extract shell/providers/navigator; no logic changes.

PR-6: Tests & Smoke

Vitest/RTL config; core unit/contract/snapshot tests; smoke runner.

PR-7: DX & Docs

Scripts, lint rules, CI config (fail on warnings); README/CONTRIBUTING/COMMANDS.

Each PR ships with:

diff.patch, PR_BODY.md, runbook.md, tests_added.txt.

Validation Gates (must pass)
npx tsc --noEmit → 0

npx eslint . → 0 errors, 0 warnings (STRICTNESS=max)

npm test → pass; coverage ≥ 0.75

npm run smoke → pass

No secrets detected

App boots; main flows work

Rollback Strategy
One PR = one branch. If a gate fails:

git revert -m 1 <merge_commit> or drop the branch.

Document in ROLLBACKS.md.

Open a follow-up “fix-forward” PR with narrowed scope.

Estimated Local Commands (non-network)
bash
Copy code
# Typecheck + lint + tests + smoke (local)
npx tsc --noEmit
npx eslint .
npm test
npm run smoke

# iOS refresh if native files changed
npx expo prebuild -p ios && (cd ios && pod install)
