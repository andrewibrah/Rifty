# Riflett System Blueprint — Founder Edition

## 1. Experience Thesis
Riflett is a reflective operating system. Users converse with a coach-like agent that captures unstructured thought, routes it into the right ritual (journal, goal, schedule), and layers AI insights that are transparent, auditable, and adaptive. The core promise is deep personal context, not generic productivity.

## 2. Capability Stack Overview
| Layer | Responsibilities | Key Tech |
|-------|------------------|----------|
| **Client (Expo App)** | Conversational UI, offline-first cache, on-device embeddings, telemetry capture, settings management | React Native 0.81, TypeScript, AsyncStorage, expo-sqlite |
| **Intent Runtime** | Low-latency classification, slot filling, routing decisions, active-learning signals | JS Naive Bayes intent engine (runtime/intent-engine), SlotFiller, Redactor |
| **Services Layer** | AI orchestration (OpenAI), supabase data APIs, personalization, audit logging | `src/services/*`, OpenAI ChatCompletions, Supabase JS client |
| **Data Platform (Supabase)** | Auth, journaling data, persona signals, intent audits, telemetry sink, edge functions | PostgreSQL, RLS policies, Edge Functions, pgcrypto |
| **Training & Evaluation** | Curated datasets, reproducible model training, offline evaluation, active learning curation | Node + TypeScript scripts in `/training`, `/evaluation`, `/active_learning` |
| **Ops & Observability** | Health probes, logs, metrics, manual review loops, runbooks | `scripts/health.ts`, telemetry pipeline, founder docs |

## 3. User & Data Flow
1. **Auth**: Supabase email/OAuth handles identity → `user_settings` seeded post-onboarding.
2. **Message Loop**:
   - User sends message → JS intent runtime scores top intents.
   - `agent/pipeline` enriches with memory search, redaction, user config.
   - Route decision triggers: entry creation, AI reflection, or clarification.
   - OpenAI responses stored with ethical trace and persona learning.
3. **Storage**:
   - `entries`, `messages`, `user_settings`, `persona_signals`, `intent_audits` tables capture long-term state.
   - Local SQLite caches embeddings for fast context recall.
4. **Learning Loop**:
   - Intent mismatches recorded via `logIntentAudit`.
   - `/active_learning` scripts pull, dedupe, and surface for labeling.
   - Labeled datasets flow into `/training` to re-train classifier.
   - `/evaluation` runs regression metrics before model promotion.
   - `/runtime` hosts promoted artifact consumed by mobile fallback + edge functions.

## 4. Domain Models & Contracts
- **Intent Payload**: `label`, `confidence`, `topK`, `slots` (structured by `SlotFiller`).
- **Entry Types**: `journal`, `goal`, `schedule` plus metadata and AI annotations.
- **Persona State**: Highly opinionated schema storing cadence, learning style, drift rules.
- **Audit Trails**: `intent_audits` store human corrections; telemetry traces recorded per utterance.
- **Model Artifact**: Deterministic JSON w/ priors, token likelihoods, metadata, version, checksum.

## 5. Platform Deployment Plan
1. **Environments**
   - `local`: Expo dev + Supabase local dev stack.
   - `staging`: Supabase project with anonymised seed data, restricted OpenAI key.
   - `prod`: Locked supabase project, key rotation via environment secrets.
2. **CI / Quality Gates**
   - `npm run lint` + `tsc --noEmit` (existing via Expo tooling).
   - `npm run test:persona` (future: `npm run test:intent` etc.).
   - `ts-node evaluation/run-e2e.ts` before publishing runtime artifact.
3. **Release Workflow**
   - Collect new audits → `active_learning/picklist` generates label batch.
   - Labels appended to `training/data/intents.parquet` (or JSON fallback).
   - Run `training/intent/trainIntentModel.ts` → outputs updated `runtime/intent-engine/model.ts` + metadata.
   - Execute `evaluation/intent/evaluateIntentModel.ts` against holdout set – require P95 accuracy > target.
   - If pass → bump model version, commit artifact, update `CHANGELOG.md`.
   - Deploy updated Expo build + Supabase edge function referencing new artifact.

## 6. Governance & Compliance
- **Data Residency**: Supabase region-specific (configure in `supabase/config.toml`).
- **PII Handling**: Redactor masks high-sensitivity tokens prior to telemetry.
- **User Consent**: Onboarding flow records cadence, prompts, crisis card; store consent logs (future table `user_consents`).
- **Model Transparency**: For each AI response, ethical trace returned + persisted.
- **Security**: Service role keys only used within Supabase Edge functions; app uses anon key. OAuth flows through Supabase provider integration.

## 7. Scaling Roadmap
1. **Q1 2025**: Solidify intent accuracy via weekly training cadence; ship evaluation dashboards; integrate streaming AI responses.
2. **Q2 2025**: Launch pattern engine & schedule orchestration (calendar sync); start multi-tenant team support.
3. **Q3 2025**: Personal coach marketplace (personas) + cross-user insights (fully anonymized aggregates).
4. **Q4 2025**: Expand to web, build plugin API for third-party rituals.

## 8. Founder Directives
- Protect clarity: Document every data contract; no opaque magic.
- Automate learning: Closing the audit loop is a core differentiator.
- Design for trust: Ethical transparency is not optional—to be enforced by schema + runtime invariants.
- Deliver readiness: Each directory (`active_learning`, `evaluation`, `runtime`, `training`) must be runnable and testable locally before we call for deployment.

