 ### Feature Map

  - Chat & Intent Routing — Drives the main chat screen, session rotation, and offline persistence. Key files: apps/mobile/App.tsx:1-200 wires UI with Supabase
    session info, check‑ins, personalization, and menus; apps/mobile/src/hooks/useChatState.ts:1-200 orchestrates sending entries, intent prediction, planner/tool
    execution, and Supabase logging; apps/mobile/src/chat/handleMessage.ts:1-40 wraps the agent pipeline result. Data models: apps/mobile/src/types/chat.ts:1-34 (message +
    groups), apps/mobile/src/types/intent.ts:1-46 (intent metadata + processing steps). Dependencies: Supabase auth + storage, AsyncStorage, OperatingPicture context,
    Memory class, OpenAI planner/toolchain, Supabase edge functions (apps/mobile/src/services/data.ts:37-199).
  - Journal Entries & Retrieval — Lists/creates journal entries, audit logs, and analyst queries. Key files: apps/mobile/src/services/data.ts:1-199 (edge function
    wrappers for journals/messages); apps/mobile/src/lib/entries.ts (classification + mapping); Supabase edge functions under supabase/functions/* for data writes.
    Data models: RemoteJournalEntry (apps/mobile/src/services/data.ts:20-35), Supabase schema snapshots (infra/db/supabase.sql:1, infra/db/supabase_current_schema.sql:1). Dependencies:
    Supabase edge runtime, AsyncStorage caches, scripts/scan-secrets, and supabase/.temp metadata.
  - Goals & Progress Intelligence — Creates, dedupes, and contextualizes goals with embeddings. Key files: apps/mobile/src/services/goals.unified.ts:1-170 (Supabase
    table writes + edge calls), apps/mobile/src/services/goals.ts:1-60 (API shim), menu components apps/mobile/src/components/menu/GoalsPanel.tsx, onboarding steps apps/mobile/src/
    screens/onboarding/steps/GoalsStep.tsx. Data models: apps/mobile/src/types/goal.ts:1-140 (Goal schema, micro-steps, reflections). Dependencies: Supabase goals,
    goal_progress_cache, edge functions (create_goal, goals_list_with_context), utils/flags for dedupe thresholds, OpenAI embeddings.
  - Scheduling, Reminders & Check-ins — Suggests focus blocks, stores schedule blocks, and handles morning/evening check-ins. Key files: apps/mobile/src/services/
    schedules.ts:1-187 (persist blocks, compute suggestions), apps/mobile/src/services/checkIns.ts:1-192 (table CRUD + prompts), apps/mobile/src/components/CheckInBanner.tsx.
    Data models: apps/mobile/src/types/mvp.ts (CheckIn definitions referenced by services), schedule block interface inside services. Dependencies: Supabase tables
    schedule_blocks, check_ins, getOperatingPicture data, AsyncStorage for caching prompts.
  - Personalization & Onboarding — Captures persona, cadence, privacy gates, onboarding screens. Key files: apps/mobile/src/services/personalization.ts:1-200 (loads/
    stores settings + feature toggles), apps/mobile/src/hooks/usePersonalization.ts, apps/mobile/src/screens/onboarding/*. Data models: apps/mobile/src/types/personalization.ts:1-80.
    Dependencies: Supabase profiles, features, AsyncStorage caching, persona catalog definitions in apps/mobile/src/services/personaCatalog.ts.
  - AI / Agent Stack & Memory — Local agent pipeline, embeddings, gating, telemetry, prompts. Key files: apps/mobile/src/agent/pipeline.ts:1-120 (classification,
    routing), apps/mobile/src/agent/memory.ts:1-150 (local SQLite cache + ragSearch), apps/mobile/src/services/mainChat.ts:1-170 (OpenAI call + synthesis), apps/mobile/src/services/ai.ts:1-
    150 (LLM request builder). Data models: OperatingPicture + RagResult (apps/mobile/src/services/memory.ts:18-86). Dependencies: OpenAI API key from Expo config,
    AsyncStorage SQLite, Supabase RPC get_operating_picture, rag_search, prompts in apps/mobile/prompts/*.txt, analytics via apps/mobile/src/agent/telemetry.ts.
  - Supabase Edge & Data Layer — Deno edge functions act as ad-hoc API. Key files: apps/mobile/src/services/edgeFunctions.ts:1-150 (client wrappers), supabase
    functions directories (create/update entry, memory, etc.), shell scripts deploy-edge-functions.sh, docs EDGE_FUNCTIONS_DEPLOYMENT.md. Data:
    SQL migration files across /infra/db/supabase/migrations, infra/db/create_missing_tables.sql. Dependencies: Supabase CLI, scripts (DEPLOYMENT_COMMANDS.md,
    MIGRATION_SUMMARY.md).

  ### Problems Found

  - Monolithic mobile entry point: apps/mobile/App.tsx:1-200 mixes UI composition, Supabase auth/session logic, check-in scheduling, analytics, and storage, making
    navigation/state impossible to unit-test and blocking modularization.
  - Mobile directly owns persistence: Client invokes Supabase edge functions/tables without a gateway (apps/mobile/src/services/data.ts:37-199, apps/mobile/src/services/
    checkIns.ts:58-192, apps/mobile/src/services/schedules.ts:87-187), so credentials + row level security concerns live on the handset.
  - LLM secrets + orchestration on device: OpenAI API key resolution and prompt execution happen inside the Expo bundle (apps/mobile/src/services/mainChat.ts:56-169,
    apps/mobile/src/services/ai.ts:1-120), exposing secrets and making prompt updates require app releases.
  - Agent & embeddings run locally: apps/mobile/src/agent/memory.ts:1-150 maintains SQLite stores, embeddings, and rag fetching in the UI thread, coupling UX to
    memory sync and blocking the move to a centralized AI service.
  - Schema definitions drift: infra/db/supabase.sql:1, infra/db/supabase_current_schema.sql:1, infra/db/supabase.txt:1, and infra/db/create_missing_tables.sql:1 each define overlapping
    tables; keeping them in sync is error-prone and confuses migration source of truth.
  - Shared AI utilities straddle environments: apps/mobile/src/services/ai.ts:20-35 imports ../../services/ai/gate (a Node-style module with zod + tests) directly
    into the mobile app, meaning bundler has to polyfill server logic and increases bundle size/risk.
  - Edge-function RPC as API: apps/mobile/src/services/edgeFunctions.ts:1-150 exposes dozens of untyped function names; error handling and DTO validation happen on
    the device, so backend changes can crash the app without semver.

  ### Target Layout (Tree)

  apps/
    mobile/
      App.tsx
      app.config.ts
      index.ts
      assets/
      prompts/
      src/
        navigation/
        features/
          chat/
          journal/
          goals/
          personalization/
        api/
        store/
        theme/
      services/ai/
      vendor/
    api/
      package.json
      tsconfig.json
      README.md
      src/
        index.ts (Fastify/Express placeholder)
  services/
    python-ai/
      pyproject.toml
      README.md
      app/
        main.py (FastAPI app)
  packages/
    shared/
      package.json
      src/
        index.ts
        types/
  infra/
    db/
      supabase/
        migrations/ (Supabase SQL)
      supabase.sql
      supabase_current_schema.sql
      create_missing_tables.sql
      refresh_mv.sql
      supabase.txt
      SUPABASE_DATABASE_CALLS.md
      SUPABASE_SECRETS_GUIDE.md

  ### Contracts (DTO + Endpoints)

  Common error envelope

  type ErrorResponse = {
    error: { code: string; message: string; details?: Record<string, unknown>; requestId: string };
  };

  Mobile → API (TypeScript)

  - POST /v1/auth/session/refresh
    Request: { refreshToken: string } → Response { session: SupabaseSessionDTO }.
  - POST /v1/chat/messages

    interface SendMessageRequest {
      sessionId: string;
      text: string;
      timezone: string;
      clientContext?: { appVersion: string; locale: string };
    }
    interface SendMessageResponse {
      messageId: string;
      intent: IntentMetadataDTO;
      ai: ChatReplyDTO;
      brief: MainChatBriefDTO;
      receipts: ActionReceiptDTO[];
    }

    Errors: 400 invalid text, 409 session rotation required.
  - GET /v1/journal/entries?before=<iso>&limit=<n>&type=<journal|goal|schedule>
    Response { entries: JournalEntryDTO[]; nextCursor?: string }.
  - POST /v1/journal/entries
    Request { type: EntryType; content: string; metadata?: Record<string, unknown>; mood?: string } → Response { entry: JournalEntryDTO }.
  - GET /v1/goals?status=active / POST /v1/goals / PATCH /v1/goals/{goalId}
    DTOs derived from packages/shared/ts/dto/goals.ts (aligning with Goal, CreateGoalInput, UpdateGoalInput). Responses always wrap { goal: GoalDTO }.
  - POST /v1/schedules/blocks
    Request { start: string; end: string; intent: string; goalId?: string; metadata?: Record<string, unknown> } → Response { block: ScheduleBlockDTO }.
  - GET /v1/check-ins/pending?type=daily_morning
    Response { checkIn?: CheckInDTO; prompt: string }.
  - GET /v1/personalization/bundle / PUT /v1/personalization/bundle
    Request body mirrors PersonalizationStateDTO; response returns { bundle: PersonalizationBundleDTO }.
  - GET /v1/memory/brief?kinds=entry,goal
    Response { operatingPicture: OperatingPictureDTO; retrieval: RagResultDTO[]; scheduleSuggestions: ScheduleSuggestionDTO[] }.

  API ↔ Python FastAPI

  - POST /ai/chat/respond

    Request: {
      "user_id": "uuid",
      "text": "string",
      "intent": IntentMetadataDTO,
      "brief": MainChatBriefDTO,
      "persona": PersonaRuntimeDTO
    }
    Response: {
      "reply": "string",
      "learned": ["fact1"],
      "ethical": "string",
      "plan": PlannerResponseDTO,
      "receipts": ActionReceiptDTO[]
    }
  - POST /ai/memory/write
    Request { user_id: "uuid", facts: FactInputDTO[] } → Response { written: number }.
  - POST /ai/memory/search
    Request { user_id: "uuid", query: "text", scope: ["entry","goal"], top_k: number } → Response { results: RagResultDTO[] }.
  - POST /ai/embed
    Request { texts: string[], model?: string } → Response { embeddings: number[][] }.
  - POST /ai/summarize
    Request { content: string, mode: "entry"|"goal"|"schedule" } → Response { summary: string, tags: string[] }.

  All FastAPI routes respond with { data: ..., error: null } or { data: null, error: { code, message } } to keep the contract symmetric.

  ### Migration Plan (Commit-sized steps)

  1. Scaffold workspace — Add apps/, services/, packages/, infra/ directories, root pnpm/npm workspaces config, and baseline README describing
     architecture.
  2. Extract shared DTOs — Move TypeScript types (apps/mobile/src/types/*.ts) into packages/shared/ts/dto, add build step, update mobile imports to consume from the
     package.
  3. Introduce API gateway skeleton — Create apps/api with Fastify/Express setup, Supabase service account client, and placeholder routes returning mocked
     data plus integration tests.
  4. Move Supabase access into API — Port apps/mobile/src/services/data.ts, goals*.ts, personalization.ts, schedules.ts, checkIns.ts logic into API services; replace
     mobile usage with REST client in apps/mobile/src/api.
  5. Stand up Python AI service — Create FastAPI app with /chat/respond, /memory/*, /embed, /summarize using current apps/mobile/prompts/logic; add Dockerfile and
     CI job.
  6. Wire API ↔ Python service — Implement pythonAiClient in API, route chat/memory requests through it, persist results via Supabase, add contract tests.
  7. Refactor mobile app — Remove direct Supabase/AI imports, swap to API client, simplify useChatState to focus on UI state.
  8. Consolidate migrations — Move SQL files into infra/db/migrations, delete redundant schema snapshots, document migration workflow.
  9. Deprecate Supabase edge functions — Replace mobile calls with API endpoints, retire unused functions, update deployment scripts.
  10. Clean up legacy modules — Remove apps/mobile/src/agent/* from mobile bundle (or move to Python), delete unused scripts/logs, validate via automated tests.

Catalog all client-to-Supabase calls in apps/mobile/src/services/** and agent flows in apps/mobile/src/agent/**; list request/response shapes.
  shared schemas.
  - For now, proxy to Supabase REST/RPC and return the same payloads the mobile app expects.

  □ Spin up Python AI service (services/python-ai)
  - Define Pydantic models from the shared schemas; expose /ai/respond, /ai/memory/search, /ai/embed, /ai/summarize.
  - Stub logic initially (echo/fixtures), then move agent logic (intent routing, memory brief, embeddings) from apps/mobile/src/agent/** into Python modules with tests.

  □ Swap mobile client to call the gateway
  - Create a simple HTTP client layer in apps/mobile/src/api that hits apps/api endpoints (base URL from config/feature flag).
  - Replace direct Supabase/edge function calls in apps/mobile/src/services/** with these API calls, keeping the same return shapes and types.
  - Keep a feature flag to fall back to current in-app logic while rolling out.

  □ Migrate agent/memory functions off device
  - Port apps/mobile/src/agent/pipeline.ts, memory.ts, embeddings.ts, intentRouting.ts, telemetry.ts into Python equivalents (retain behavior, add tests).
  - Adjust mobile to send requests to /ai/respond and /ai/memory/search instead of running the pipeline locally; keep DTOs aligned via shared schemas.

  □ Hardening and hygiene
  - Add integration tests that spin up API + Python with mocked Supabase and assert contract compliance.
  - Containerize apps/api and services/python-ai (docker-compose for local dev), document env vars/secrets, and add lint/typecheck/test scripts to CI.

  □ Cutover & cleanup
  - Remove or gate legacy in-app agent/Supabase paths once API+Python are stable.
  - Refresh docs to show the new flow (mobile → API → Supabase/Python), and keep the shared schema generation as the single contract source.
Here are the TypeScript files currently running AI/agent logic on the client that should be ported into the Python FastAPI service (services/python-
  ai/*.py):
#### typescript -> python
  - Core agent pipeline (apps/mobile/src/agent/):
      - actions.ts, cache.ts, contextWindow.ts, embeddings.ts, intentRouting.ts, memory.ts, outbox.ts, pipeline.ts, planner.ts, redactor.ts,
        riflettIntentClassifier.ts, slotFiller.ts, telemetry.ts, types.ts, userConfig.ts, utils/nanoid.ts
  - In-app AI orchestrator (apps/mobile/src/services/):
      - ai.ts, mainChat.ts, summarization.ts, embeddings.ts, goals.unified.ts (and goals.ts wrapper), contextHeuristics.ts, riflettSpine.ts,
        spineQueue.ts, modelRegistry.ts, goalInsights.ts
  - Legacy AI helpers moved under services/ai (apps/mobile/services/ai/):
      - gate.ts, middleware/principle_anchor.ts, pipeline.ts, router.ts, schemas/{plan.schema.json, reflection.schema.json, schedule.schema.json} +
        schemas/validator.ts, utilities/{pal_mode.ts, self_consistency.ts, tree_of_thoughts.ts}, tests/*.ts for these modules
  - AI-adjacent feature shims that should call the Python service instead of local logic:
      - apps/mobile/src/services/schedules.ts (suggestBlocks), apps/mobile/src/services/personalization.ts (persona tagging/ML bits), apps/mobile/src/
        services/memory.ts (OperatingPicture/ragSearch wrappers), apps/mobile/src/utils/persona.ts (computePersonaTag), apps/mobile/src/lib/intent.ts
        (intent mapping/definition lookups)