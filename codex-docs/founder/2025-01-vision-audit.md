# Riflett Founder Audit — 2025-01-09

## Current Positioning
- **Product**: Mobile-first reflective OS (Expo/React Native) with Supabase backend and OpenAI-assisted coaching.
- **Live Pillars**:
  - Conversational interface with journaling, goal, schedule entry structure.
  - Supabase auth + storage for entries, messages, persona signals, intent audits.
  - On-device memory cache, slot filling, telemetry scaffolding, OpenAI service wrappers.
  - Edge function (`classify_and_create_entry`) for intent + insertion using OpenAI JSON schema.
- **Operational Stack**: Expo app, Supabase project, OpenAI API, local SQLite cache, TypeScript service tier.

## Gaps to Close Before Deployment Prep
1. **Runtime Intent Engine**
   - RN fallback always returns “Journal Entry”; no JS-side ML inference yet.
   - Native intent module unspecified; needs deterministic JS runtime with confidence + rationale surfaces.
2. **Training Lifecycle**
   - No reproducible pipeline to train / re-train intent classifier from data + audits.
   - Datasets, feature extraction, and model artifacts absent.
3. **Evaluation Harness**
   - Lacks automated regression evaluation, calibration metrics, and CI-friendly reports.
4. **Active Learning Loop**
   - Intent audits stored but no orchestrated loop to prioritise, label, and re-ingest data.
5. **Data Contracts & Observability**
   - Limited docs on Supabase schema, event logs, telemetry exports, and data retention policy.
6. **Deployment Readiness**
   - Missing structured runbooks, `.env` templates for CI/CD, health checks, and smoke tests.

## Immediate Focus Areas
1. Ship JS runtime intent engine w/ model artifact + integration hook.
2. Lay down `training`, `evaluation`, `active_learning`, `runtime` directories with runnable scripts + docs.
3. Extend Supabase schema for audit workflows and pipeline metadata.
4. Produce founder-grade architecture narrative tying data, AI, UX, and compliance.
5. Prepare verification steps (tests, lint, manual scripts) for deployment readiness.

## North Star Metrics (suggested)
- Intent accuracy @ P95 > 0.87 across top 5 intents.
- Feedback closure time < 48h for misrouted intents.
- AI reply latency < 6s P95 w/ streaming roadmap.

