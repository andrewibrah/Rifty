# Main Chat Rebrand

## Overview
The Main Chat pipeline now builds a situational brief that unifies personalization, live goal state, journal memory, and schedule anchors before calling the LLM. A dedicated synthesizer produces the mandatory structure:

1. One-sentence diagnosis.
2. Two to three levers tied to real receipts.
3. One reversible action with receipts and confidence bands.

New prompt templates live under `prompts/mainChat.system.txt` and `prompts/planner.system.txt`.

## Data Flow
1. **Personalization** – `fetchPersonalizationBundle` pulls Supabase `user_settings` plus the `features` table for privacy gates and crisis rules. `UserConfig.loadUserConfig` hot-reloads the bundle and broadcasts to in-flight conversations.
2. **Memory** – `Memory.getBrief` fetches `operatingPicture` (goals, entries, schedule horizon) and performs Supabase-first RAG via `ragSearch`. A scored retrieval list (recency 40%, priority 30%, semantic 15%, affect 10%, relationship 5%) feeds both planner and main chat.
3. **Goals** – `listActiveGoalsWithContext` joins `mv_goal_priority`, `goal_reflections`, and linked entries to give planner and LLM structured goal state with conflicts and progress.
4. **Schedule** – Planner schedule actions now persist using `persistScheduleBlock`, emit Supabase events, and project back into memory for the next turn.
5. **Synthesis** – `synthesize` converts the brief into diagnosis/levers/action and supplies receipts plus confidence bands for telemetry and UI display.

## Telemetry & Receipts
`src/agent/telemetry.ts` now stores masked text only, redaction summaries (placeholder → length), scored retrieval IDs, planner payload preview, action outcomes, confidence bands, and receipts. The log is capped at 100 frames and persists in `AsyncStorage`.

`buildReceiptsFooter` (exported from `src/services/mainChat.ts`) produces the “quiet receipts” footer used by the renderer and telemetry.

## Testing
Vitest suites cover:
- Personalization hot reload (`tests/unit/userConfig.test.ts`).
- Retrieval scoring weights (`tests/unit/pipelineScoring.test.ts`).
- Receipts footer synthesis (`tests/unit/receipts.test.ts`).
- Telemetry masking and updates (`tests/unit/telemetry.test.ts`).
- Schedule persistence validation (`tests/unit/schedules.test.ts`).
- Brief assembly integration (`tests/integration/brief.test.ts`).

Run:
```bash
npm install
npm run test:unit
npm run test:int
```

## Scripts
```
"test:unit": "vitest run --runInBand --dir tests/unit"
"test:int": "vitest run --runInBand --dir tests/integration"
"db:migrate:up": "npx supabase db migrate up --env-file .env"
"db:migrate:down": "npx supabase db migrate down --env-file .env"
"seed": "npx supabase db seed --env-file .env"
"lint": "eslint src"
"typecheck": "tsc --noEmit"
```

## Rollback Plan
1. Disable the feature flag: set `FEATURE_MAINCHAT_REBRAND=false` in `.env` and `.env.example`.
2. Revert prompts to previous versions if needed.
3. Execute `npm run db:migrate:down` to roll back migration `20251021_mainchat_rebrand.sql` (restores schema to pre-rebrand state).
4. Redeploy the app / restart services so PostgREST refreshes its schema cache.

## Acceptance Checklist
- [x] Personalization injected at runtime and hot-reloads.
- [x] Memory unified through Supabase RAG with scored retrieval.
- [x] Goals and schedules persisted with receipts + Supabase telemetry.
- [x] Main Chat always returns diagnosis, levers, reversible action with receipts.
- [x] Telemetry records provenance with masked text only.
- [ ] Supabase migration applied in target environments (`20251021_mainchat_rebrand.sql`).
