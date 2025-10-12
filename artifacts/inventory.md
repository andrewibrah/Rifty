# Repository Inventory

## Overview
- React Native (Expo 54) app with Supabase backend + on-device agent pipeline.
- Primary languages: TSX (~8.5k LOC), TypeScript (~5.1k LOC), JSON (~14.9k LOC driven by lockfiles/config).
- Major domains: mobile chat UI, AI agent orchestration, Supabase migrations/functions, iOS native intent module.

## Size & Structure
- Total tracked source LOC (excluding Pods/node_modules/build): ~33k.
- Key directories:
  - `App.tsx` (~1.8k LOC) — top-level RN app container, auth, onboarding, chat orchestration.
  - `src/agent/` (12 files) — intent routing, embeddings, planner, telemetry, AsyncStorage caches.
  - `src/components/` (UI for chat, menus, settings, auth, modals).
  - `src/hooks/` (chat/menu/personalization state machines, heavy business logic).
  - `src/services/` (Supabase data layer, OpenAI integrations, personalization store).
  - `src/lib/` (Supabase client init, entry helpers, intent utilities).
  - `src/native/` (bridge wrappers around `RiflettIntentModule`).
  - `supabase/` (SQL migrations, Edge Functions, config).
  - `ios/riflett/` (AppDelegate, Swift bridging, plist, storyboard).

## Crawl Chunks (<=2k LOC each)
1. `.env`, `App.tsx`, product docs, Expo config, import map, `ios/Podfile` — main RN shell + env secrets (Supabase/OpenAI) and metadata.
2. `ios/Podfile.lock` — resolved CocoaPods graph (Expo/ReactNative modules, Supabase dependencies).
3. `ios/riflett/*`, Xcode project, Swift intent bridge, storyboard, privacy manifests, metro config.
4. `package-lock.json` — npm dependency lock (Expo 54, React 19.1, supabase-js 2.74, AsyncStorage 2.2, etc.).
5. `package.json`, `scripts/health.ts`, `src/agent/*`, chat entry components — agent pipeline, health check CLI, chat shell UI.
6. `src/components/Menu*`, `Message*` — journaling goal/schedule menu, message bubbles, input primitives.
7. Modals (`ScheduleCalendarModal`, `SettingsModal`, `TypingIndicator`), auth screens — calendar flow, settings UX, loading/typing effects.
8. `src/components/menu/MenuEntryChat.tsx`, constants, theme context — entry review UI, intent constants, storage keys, theming provider.
9. Hooks + libs (`useChatState`, `useMenuState`, `useEventLog`, `usePersonalization`, `lib/supabase.ts`, `lib/entries.ts`, services glue) — state machines + Supabase/OpenAI integration.
10. Onboarding flow + steps (Anchors/Goals/Identity/etc.) — personalization wizard.
11. `src/services/{ai,data,personalization}.ts`, `src/theme/index.ts`, `src/types/*` — AI orchestration, Supabase data API, type models, theming tokens.
12. Utils + Supabase assets (`persona.ts`, `purgeLocal.ts`, `supabase/functions/*`, SQL migrations, tests/persona.test.ts, tsconfig) — persona tagging, migration helpers, Deno edge functions.

## Dependencies
- Runtime: Expo 54.0.12, React 19.1, React Native 0.81.4, React DOM 19.1, `@supabase/supabase-js` 2.74, AsyncStorage 2.2, RNE UI 4.0-rc, `expo-file-system` 19.0, `expo-sqlite` 16.0.
- Native (Pods via lockfile): Hermes engine, Expo modules, RN gesture handler, react-native-safe-area-context, CoreML bridge.
- Dev: TypeScript ~5.9, `ts-node` 10.9, Expo module scripts, `@types/react` ~19.1, `@types/node` 24.
- Edge function import map pins `@supabase/supabase-js@2.45.1` for Deno build.

## Tooling & Scripts
- npm scripts: `start` (metro), `android`, `ios`, `web`, `health` (ts-node Supabase sanity check).
- TypeScript: strict mode enabled, `skipLibCheck: true`, path alias `@/*` → `src/*`, Supabase edge functions excluded from compile.
- No lint/test scripts configured; repo relies on manual `tsc` and console asserts in `tests/persona.test.ts`.
- Metro config present; no Jest/ESLint configs checked in.

## Tests & Coverage
- Single `tests/persona.test.ts` uses `console.assert` (no runner). Coverage ≈ 0% vs UNIT_TEST_FLOOR 0.75 requirement.
- No automated UI/integration tests or CI pipelines detected.

## Secrets & Config Hygiene
- `.env` committed with live-looking Supabase URL/anon key and `EXPO_PUBLIC_OPENAI_API_KEY` (sk-proj…). High-risk secret exposure.
- No `.env.example` or secret scanning hooks.
- Supabase service role key expected via environment for Edge function; not provided.

## Licenses
- No top-level LICENSE file. LICENSE_POLICY requires adding SPDX headers/preserving existing; current files lack headers.
- Pod dependencies include their own licenses via CocoaPods; not aggregated.

## Known Issues & Hotspots
- `App.tsx` monolith (~1.8k LOC) mixes UI, state, telemetry wiring; candidate for modularization.
- `useChatState.ts` dense async workflow (OpenAI, Supabase, telemetry) with complex state & error handling.
- `src/services/ai.ts` and `supabase/functions/classify_and_create_entry` issue blocking network calls; rely on OpenAI API.
- TypeScript `tsc --noEmit` fails (see findings) — planner error handling, Account screen props, native intent typing, `useChatState` variable ordering.
- Native module bridging (`RiflettIntentModule.swift`) spawns CoreML classifier; fallback logic runs on background queue but has minimal error handling.
- Supabase migrations add entries/messages/personalization/intent audit tables; RLS policies present but duplication in `fix_policies` migration.

## Build/Deployment Targets
- Expo bare workflow (new architecture enabled). iOS bundle ID `ai.reflectify.mobile`.
- Supabase Edge Functions deployed via `supabase/functions/*`; import map uses esm.sh.
- No CI/CD config detected; manual builds implied.

