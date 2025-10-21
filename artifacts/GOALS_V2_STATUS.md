# Living Goals v2 Ledger

## 2025-02-14 Phase 0 — Kickoff
### Baseline Scan
- goals table present with micro_steps JSON and unused columns (`supabase/migrations/20250114000000_mvp_enhancements.sql:61-79`, `supabase/migrations/20250115030000_grant_access_to_new_tables.sql:240-324`).
- Duplicate goal schema maintained in multiple migrations needing consolidation path forward (same refs as above).
- Type layer mirrors schema but lacks GoalReflection or health types (`src/types/mvp.ts:79-121`, `src/types/mvp.ts:173-178`).
- Edge auto-create duplicates create pipeline and omits metadata/target info (`supabase/functions/process_entry_mvp/index.ts:304-341`).
- UI toggles write empty string to `completed_at` and bypass service helpers (`src/components/menu/GoalsPanel.tsx:97-146`).
- Weekly review uses simple step counts; no drift or embeddings logic (`src/services/review.ts:36-74`).

### High-Level Plan (Time estimates)
1. Phase 1 — Data foundations & unified pipeline (est. 3-4 working days).
2. Phase 2 — Reflections, health computation, chat recall (est. 4-5 working days).
3. Phase 3 — Calendar anchors, export v2, rollout polish (est. 3 working days).


### Phase 0 Verification
- Recorded `git status -sb` at `artifacts/logs/phase0_git_status.md`.

## 2025-02-14 Phase 1 — Data foundations & unified pipeline
### Changes
- Added `20250214090000_goals_v2_init.sql` migration with pgvector enablement, goal reflections/progress/AI session tables, optional link/milestone stubs, and RLS policies.
- Introduced `src/types/goal.ts` with Zod schemas and migrated goal typings in `src/types/mvp.ts`.
- Implemented unified goal pipeline in `src/services/goals.unified.ts` and routed legacy service through it; normalized metadata, embeddings, dedupe, and progress cache sync.
- Updated UI + domain usage (e.g. `GoalsPanel`, `lib/entries`) to consume new types and avoid blank `completed_at` writes.
- Extended test runner to validate goal schemas and verify migration fragments; added dependency `zod` entry.

### Verification
- `npm run test:codex` (see `artifacts/logs/phase1_tests.log`).

### Follow-ups / Risks
- Need richer integration tests (Supabase RLS enforcement, dedupe edge cases) and server-side refactor for edge functions in Phase 2.
- Backfill + scheduled jobs pending future phases per roadmap.

## 2025-02-14 Phase 2 — Reflections, health, chat recall
### Changes
- Added goal similarity RPC (`match_goal_embeddings`) plus shared Deno helpers for env, embeddings, and metrics (`supabase/migrations/20250214090000_goals_v2_init.sql`, `supabase/functions/_shared/*`).
- Implemented edge functions `link_reflections`, `compute_goal_health`, and `main_chat_goal_recall` with reusable progress recomputation (`supabase/functions/link_reflections/index.ts`, `supabase/functions/compute_goal_health/index.ts`, `supabase/functions/main_chat_goal_recall/index.ts`).
- Extended client pipeline to invoke link_reflections for chat + MVP flows and to surface goal recall guidance inside chat (`src/lib/entries.ts`, `src/hooks/useChatState.ts`).
- Introduced goal insights service and enriched GoalsPanel with coherence bars, badges, and reflection previews under the goals v2 flag (`src/services/goalInsights.ts`, `src/components/menu/GoalsPanel.tsx`).
- Added feature flag utilities and updated unified goal service + supporting modules to consume shared thresholds (`src/utils/flags.ts`, `src/services/goals.unified.ts`).
- Script checks now validate new migrations/functions, and `.env.example` already reflects required flags (`scripts/run-tests.ts`).

### Verification
- `npm run test:codex` (see `artifacts/logs/phase2_tests.log`).

### Follow-ups / Risks
- Integrate edge functions with Supabase cron for scheduled health recompute/backfill; add dedicated RLS tests using local db harness.
- UI still lacks calendar anchors/badges alignment from Phase 3 scope; export payloads not yet updated.
- Need load-test of embedding RPCs and confirm vector indexes compiled in staging before rollout.

## 2025-02-14 Phase 3 — Calendar anchors, export v2, polish
### Changes
- Added goal anchor scheduling + RLS (`goal_anchors`) and shared calendar service with rhythm reset planning (`supabase/migrations/20250214090000_goals_v2_init.sql`, `src/services/calendarAnchors.ts`).
- Goals panel shows anchors CTA, info nudges, coherence badges, and leverages goal insights (rhythm reset + missed anchor reminders) (`src/components/menu/GoalsPanel.tsx`).
- Export payload upgraded to versioned v2 including reflections, health cache timeline, AI sessions, and anchors (`src/services/export.ts`).
- Feature flag utilities + rollout checklist + PR draft captured in artifacts for launch coordination (`artifacts/GOALS_V2_ROLLOUT_CHECKLIST.md`, `artifacts/GOALS_V2_PR_DRAFT.md`).

### Verification
- `npm run test:codex` (see `artifacts/logs/phase3_tests.log`).

### Follow-ups / Risks
- Implement actual Supabase cron wiring for compute/link jobs and confirm anchor nudges integrate with notification system.
- Document export schema contract for downstream consumers; consider JSON schema snapshot.
- Monitor anchor scheduling UX for timezone considerations (currently naive 9am/6pm slotting).
