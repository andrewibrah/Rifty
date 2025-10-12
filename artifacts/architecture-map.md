# Architecture Map

## Core Subsystems
- **Mobile Shell (React Native)** — `App.tsx` orchestrates auth, onboarding, chat UI, modals; renders into Expo runtime (`index.ts`).
- **State Hooks** — `src/hooks/*` encapsulate chat pipeline, menu navigation, personalization, event logging. Heavy business logic concentrated in `useChatState`.
- **Agent Layer (`src/agent`)** — intent routing (`intentRouting.ts`), native predictions (`native/intent.ts`), embeddings fallback, planner (`planner.ts`), cache/telemetry/outbox utilities.
- **Data & Services** — `src/services/data.ts` for Supabase CRUD, `services/ai.ts` for OpenAI orchestration, `services/personalization.ts` for settings/profile persistence, `lib/entries.ts` for entry commits.
- **Storage** — AsyncStorage used for auth tokens, personalization cache, telemetry, planner cache; optional SQLite (`expo-sqlite/legacy`) for semantic memory.
- **Backend Surfaces** — Supabase REST (entries/messages/profiles/settings/intent_audits), Edge Function `classify_and_create_entry` (OpenAI classification + Supabase insert), SQL migrations for schema.
- **Native Extensions** — iOS `RiflettIntentModule.swift` loads CoreML intent classifier and exposes promise-based `predict` bridge.

## Module Graph (simplified)
- `App.tsx`
  → `src/components/*` (UI rendering)
  → `src/hooks/useChatState` (message lifecycle)
    → `src/chat/handleMessage`
      → `src/agent/pipeline`
        → `src/native/intent` → `RiflettIntentModule`
        → `src/agent/slotFiller`, `src/agent/intentRouting`, `src/agent/memory`
          → `src/agent/embeddings` (native/hashed fallback)
        → `src/agent/planner` → `src/services/ai` (OpenAI)
        → `src/agent/telemetry`, `src/agent/cache`, `src/agent/outbox`
    → `src/lib/entries` → `src/services/data` → Supabase REST tables
    → `src/services/ai` (compose entry note) → OpenAI HTTP API
  → `src/hooks/usePersonalization` → `src/services/personalization` → Supabase `profiles`, `user_settings`, `persona_signals`
  → `src/hooks/useMenuState` → `src/services/data`
- Edge Function `supabase/functions/classify_and_create_entry` → OpenAI + Supabase service role
- Tests reference `src/utils/persona`

## Data Flow
1. **Auth** — `lib/supabase.ts` instantiates client with env values, persists session in AsyncStorage; `App.tsx` monitors auth state and toggles `Auth` vs `AuthenticatedApp`.
2. **Chat Message** — `useChatState.sendMessage` → `handleMessage` → `agent/pipeline` predicts intent (native -> fallback), enriches context via `Memory.searchTopN`, redacts text, fetches user config.
3. **AI Planner** — `agent/planner` optionally calls OpenAI function tool to select downstream action; caches by intent slots.
4. **OpenAI Response** — `services/ai.generateAIResponse` builds chat completions request with tool forcing; returns reply/learned/ethical fields; handles fallbacks/timeouts.
5. **Entry Persistence** — `lib/entries.createEntryFromChat` constructs metadata (intent, router, memory) and inserts into Supabase `entries`. `services/data` also logs to `messages` or `intent_audits` as needed.
6. **Personalization** — `services/personalization` fetches/merges remote + cached settings, persists updates, computes persona tag, logs signals.
7. **Menu/History** — `useMenuState` fetches `entries` per type, counts annotations via Supabase `messages` filtered by metadata channel.
8. **Edge Function** — Accepts access token, classifies entry via OpenAI JSON schema, writes to `entries` with AI metadata; handles CORS and fallback when OpenAI missing.

## Platform Boundaries
- **Device ↔ Native** — `NativeModules.RiflettIntentModule.predict` (Swift CoreML) and optional embed module (`RiflettEmbeddingModule`) for vectorization.
- **Device ↔ Supabase** — REST RPC via Supabase JS (requires anon key, persists sessions, uses RLS). Health script tests `auth.getUser` + `profiles` query.
- **Device ↔ OpenAI** — Direct fetch in `services/ai.ts` and `agent/planner.ts`; timeouts, fallback notes, error wrapping; API key pulled from Expo extra/env.
- **Supabase Edge** — Deno runtime using service role key + OpenAI; subject to env secrets `PROJECT_URL`, `SERVICE_ROLE_KEY`, `OPENAI_API_KEY`.

## Hotspots & Observed Risks
- Monolithic `App.tsx` and `useChatState` create high complexity and risk for regressions; limited test coverage amplifies.
- TypeScript errors highlight incorrect UI prop usage (`src/components/Account.tsx`) and unsafe error typing (`agent/planner.ts`), indicating potential runtime issues.
- `useChatState` references `toolExecution` before declaration (TS2448) — likely logic bug.
- Native intent bridge assumes CoreML model present; fallback closes on background queue without guard for cancellation; limited error reporting to JS.
- `services/ai.resolveOpenAIApiKey` throws aggressively when key missing — app crash risk if env not provided.
- Supabase environment keys stored in repo `.env` (production-grade secrets exposure).
- Supabase migrations duplicate policy creation (`create_tables` vs `fix_policies`), potential drift/confusion.
- Edge function uses OpenAI without request throttling or cost controls; logs errors but returns generic message.

## Testing & Observability Gaps
- No automated tests around chat pipeline, planner, or Supabase integration.
- Telemetry stored locally only; no remote logging/analytics.
- Health check script limited to Supabase availability; no E2E smoke flows or coverage targets tracked.
