Top-level: work lives in services/python-ai. It’s a FastAPI backend that mirrors the old TypeScript agent/orchestrator logic with stubs
    for external systems.
  - Entry points:
      - app/main.py: creates FastAPI app and mounts routers.
      - Run locally: from services/python-ai, uvicorn app.main:app --reload --port 8000.
  - Schemas/DTOs: app/schemas/* holds Pydantic models matching shared TS types (goal, chat, intent, mvp, personalization). These keep JSON
    shapes aligned with the mobile client.
  - Agent core (app/agent):
      - pipeline.py: orchestrates handling an utterance—routes intent, calls planner, slot filler, memory, redactor, telemetry.
      - intent_routing.py + intent_definitions.py: decide intent and look up definitions.
      - planner.py, slot_filler.py, redactor.py: plan steps, fill missing info, redact sensitive fields.
      - memory.py: stubbed memory/brief retrieval, RAG-like functions.
      - telemetry.py: records/updates interaction metrics.
      - outbox.py, cache.py, context_window.py: in-memory stubs for pending actions, caching, context handling.
      - types.py: agent-specific models/enums.
      - Router: app/agent/router.py exposes /agent endpoints (see tests for expected payloads).
  - Orchestrator layer (app/orchestrator):
      - Mirrors TS services: ai.py (respond), embeddings.py, summarization.py, goals.py, context_heuristics.py, model_registry.py,
        main_chat.py, riflett_spine.py, spine_queue.py.
      - Router: app/orchestrator/router.py mounts endpoints like /ai/respond, /ai/embed, /ai/summarize, /ai/goals, /ai/context-heuristics, /
        ai/model-registry.
  - Legacy helpers (app/ai_legacy):
      - gate.py, pipeline.py, router.py: older gating/routing logic.
      - Middleware: principle_anchor.py.
      - Utilities: pal_mode.py, self_consistency.py, tree_of_thoughts.py.
      - Schemas/validation: schemas/ with JSON schema files and validator.py (uses jsonschema with retry helper).
      - Router provides legacy paths used by tests.
  - Adjacent features (app/adjacent):
      - schedules.py: suggestBlocks logic; endpoint /schedules/suggest.
      - personalization.py: persona/ML bundle; endpoint /personalization/bundle.
      - memory_endpoints.py: operating picture/brief + rag search; endpoints /memory/brief, /memory/search.
      - persona.py: compute persona tag; endpoint /persona/tag.
      - intent_endpoints.py: intent definitions; endpoint /intent/definition.
      - Router: app/adjacent/router.py.
  - Utilities/config:
      - Stubs replace Supabase/OpenAI/backing stores; signatures and return shapes match TS.
      - In-memory caches/outbox mean no persistence across restarts.
  - Tests: services/python-ai/tests/* cover agent pipeline (intent routing, telemetry, memory brief), orchestrator endpoints, legacy gate/
    router/validation, adjacent endpoints. They run with pytest + pytest-asyncio. Current state: passing locally per last run.
  - Client context: Expo/mobile is expected to call these endpoints; package.json is at repo root (run npm run start from root for Expo, not
    inside apps/mobile directly).

  How it fits the app’s goal: The backend now hosts AI intent routing, planning, memory, and orchestration so the mobile app can stay thin.
  Each module preserves TS behavior/JSON shapes, letting the client swap to HTTP calls without changing contracts.

  Key understandings for you:

  - DTO parity is critical; changing Pydantic models can break the mobile client.
  - Many parts are stubs; production requires swapping in real clients for Supabase/OpenAI/memory and adding persistence, auth, and
    observability.
  - Routers map closely to TS service functions; use tests as usage examples for payloads and expected responses.
  - Legacy and new pipelines coexist; know which one your feature touches before modifying.
  - No durability in caches/outbox/memory—don’t assume state survives reloads.
  - Expand tests when adding behavior; keep JSON shapes and field names consistent.