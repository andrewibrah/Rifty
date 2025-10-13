# Deployment Readiness Checklist

## Pipeline
- [ ] Run `npm run train:intent` to regenerate `runtime/intent-engine/model.ts`.
- [ ] Run `npm run eval:intent` and attach latest report from `evaluation/intent/reports/`.
- [ ] Run `npm run test:intent` and existing RN unit tests / detox suite (if available).
- [ ] Document model version + metrics in `CHANGELOG.md` and Supabase `model_registry` via `registerModelVersion` API.

## Supabase
- [ ] Apply migrations: `supabase db push`.
- [ ] Configure `SUPABASE_SERVICE_ROLE_KEY` secret in deployment pipeline for active-learning sync.
- [ ] Verify RLS for new tables (`model_registry`, `model_evaluations`).

## Config
- [ ] Ensure `.env` / `app.config.ts` defines `EXPO_PUBLIC_OPENAI_API_KEY`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] Rotate OpenAI key and Supabase service role before production launch.
- [ ] Update `example.env` with any new variables (service role is never committed).

## QA & Observability
- [ ] Run `npm run health` (supabase + openai smoke test).
- [ ] Validate audit trail: submit misrouted intent, ensure `intent_audits` captures row.
- [ ] Check telemetry ingestion (Supabase `telemetry` table when implemented) for compliance logs.
- [ ] Confirm `runtime/intent-engine/README.md` version matches deployed artifact.

## Release Notes
- [ ] Summarize intent engine changes (dataset deltas, evaluation metrics, new scripts).
- [ ] Capture pending risks + mitigation.
- [ ] Kick off post-deployment review 48h after launch.
