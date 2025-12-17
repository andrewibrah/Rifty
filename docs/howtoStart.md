 Backend (FastAPI):

  - From services/python-ai: source .venv/bin/activate (or python -m venv .venv && source .venv/bin/activate if not yet).
  - pip install -r requirements.txt (done once).
  - Run the API: uvicorn app.main:app --reload --port 8000.

  Expo app:

  - From the repo root: cd Rifty     should be default new terminal
  - Install JS deps if needed: npm install (or yarn).
  - Start Expo: npx expo start
  - Ensure the mobile app points at your backend (e.g., set the API base URL to http://localhost:8000 or your LAN IP in your env/config).

 Immediate gaps to close:
      - Real integrations: Swap stubs for Supabase/OpenAI/memory backends with clear interfaces and error handling/retries. Add env-based
        config and secrets hygiene.
      - Persistence & state: In-memory cache/outbox/memory won’t survive restarts—need durable store + idempotency keys.
      - Observability: Add structured logging, tracing (OTel), and metrics around latency, token usage, routing decisions.
      - Validation & security: Input validation hardening, rate limits, auth story for each endpoint, output redaction guarantees.
      - Tests: Expand beyond happy-path—golden parity against TS outputs, concurrency tests, failure injection (timeouts, partial results),
        contract tests with shared schemas.
      - Performance: Profiling and caching for embeddings/intent routing; background workers/queues for long tasks.
      - DevEx: Add lint/format (ruff/black), type checking (mypy), pre-commit hooks, docker-compose for services, and CI (pytest + lint).
  - Architectural questions to settle early:
      - Source of truth for DTOs—should we codegen from one schema to both TS/Python to avoid drift?
      - Deployment topology—single FastAPI app vs split services; API gateway/auth; rollout/feature flags for mobile.
      - Memory/telemetry backend choices and SLAs (latency, throughput).
      - How legacy helpers fit with new pipeline—converge or keep as compatibility layer?
  - Near-term plan (2–3 weeks):
      1. Wire real clients behind interfaces; add config/env loading + secrets.
      2. Add observability and basic auth/rate limiting.
      3. Introduce durable storage for cache/outbox/memory; idempotency.
      4. Expand tests with parity fixtures vs TS and failure cases; add CI + lint/type checks.
      5. Dockerize for consistent local/CI, document runbooks.
         If that aligns, I’ll draft an architecture/roadmap doc and start with wiring real clients + observability so we can measure and
         harden quickly.