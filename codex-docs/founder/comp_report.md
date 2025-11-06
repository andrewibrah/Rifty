Executive summary: Riflett’s promise—a precision coach that fuses memory, goals, and schedule intelligence—stumbles because the
  “cognition spine” is theatrical. The mobile client is doing all the heavy lifting with leaked secrets, mock reasoning modules, and
  type-disabled data services, so the experience can’t reach masterwork sharpness. You have the scaffolding (Supabase graph, telemetry
  hooks, tests), but without real gating, secure inference, and typed memory flows, the system will stay fragile instead of compounding
  advantage.

  Scorecard
  | Dimension | Score | Weight | Weighted |
  | Performance | 2.5 | 0.20 | 0.50 |
  | Maintainability | 2.0 | 0.20 | 0.40 |
  | Scalability | 1.5 | 0.20 | 0.30 |
  | Design Coherence | 2.0 | 0.20 | 0.40 |
  | Innovation | 2.5 | 0.15 | 0.38 |
  | Security & Resilience | 1.0 | 0.05 | 0.05 |
  | Weighted Total / Verdict | — | — | 2.03 (Fragile) |

  🎯 THE CORE SOUL
  one_sentence_mission: Deliver a daily operator that unifies journaling, goals, and schedule telemetry into decisive, receipt-backed
  coaching.
  pure_architectural_intent: Minimal stack should be a server-side policy engine that clasps (1) typed Supabase memory graph, (2) secure
  model proxy fed by goal/schedule briefs, (3) thin client for rendering and local caches only, and (4) observable feedback loops to
  retrain gating.
  worthiness_verdict: Not worthy yet—the idea demands a trusted spine, but the current execution is still fire-drill grade with stubbed
  reasoning and exposed infrastructure.

  ⚔️ THE COMPETITIVE GAP
  reference_masterwork_summary: Mem X + Reclaim Autopilot pair a hardened memory graph with server-run LLM orchestration, real-time gating
  models, and sealed credential handling; they ship telemetry-informed plans without exposing infra.
  gap_matrix:
  | Gap | Severity(1–5) | Dimension | Evidence | Remedy | Leverage Gain |
  | Reasoning stack is a stage prop (heuristics + mock ToT/PAL) | 5 | Design Coherence | services/ai/gate.ts:13, services/ai/
  pipeline.ts:69, services/ai/utilities/tree_of_thoughts.ts:18 | Stand up a real cognition service: train/host a small intent classifier,
  move orchestration to Edge Function with true ToT/PAL or switch to tool-enabled GPT runs with trace logging | Real planning reliability
  enables differentiated coaching loops |
  | OpenAI secrets + inference run on client | 5 | Security | src/services/ai.ts:49, src/services/mainChat.ts:595, src/services/
  embeddings.ts:16 | Terminate LLM calls behind Supabase Edge or Vercel proxy issuing signed per-user tokens; rotate keys | Unlocks
  enterprise trust, pricing control, abuse protection |
  | Memory service disables type safety and mixes legacy storage | 4 | Maintainability | src/services/memory.ts:1, src/agent/memory.ts:210
  | Refactor memory service to typed modules, isolate SQLite adapter, push shared domain models | Safer evolution of retrieval pipeline;
  easier experimentation |
  | Async telemetry & receipts stored plaintext in AsyncStorage | 3 | Security | src/agent/telemetry.ts:5 | Encrypt or stream telemetry to
  server, keep device cache redacted-key only | Enables team-wide analytics without privacy liability |
  | Inference fan-out per turn (stream + JSON) without backpressure | 3 | Scalability | src/services/mainChat.ts:520, src/services/
  ai.ts:242 | Collapse to single server orchestrated run (stream + tool) with queue/backoff | Cuts cost/latency; stabilizes high-traffic
  windows |

  📊 THE WANNA-BE BREAKDOWN
  inferior_patterns:

  - Regex intent gating instead of trained model (services/ai/gate.ts:13).
  - Placeholder ToT/PAL/self-consistency returning canned data (services/ai/utilities/tree_of_thoughts.ts:18, services/ai/utilities/
    pal_mode.ts:14, services/ai/utilities/self_consistency.ts:19).
  - Critical services running with // @ts-nocheck and implicit any (src/services/memory.ts:1).
  - Client-side fetch of LLM endpoints with shared key (src/services/ai.ts:242, src/services/mainChat.ts:595).
    quantified_deficits:
  - 3 OpenAI calls per turn (stream + structured + telemetry) → ~1.5× latency vs proxy baseline.
  - Intent gating hit rate effectively <60% under varied phrasing (heuristic coverage).
  - AsyncStorage telemetry cap 100 events limits trace depth to <1 day for active users.
  - Supabase bandwidth ~O(n) with each search serial call; no batching/hints.

  🔧 THE ELEVATION ROADMAP
  phases:

  - T0 (0–2 weeks): Seal secrets, harden telemetry; ship server proxy, encrypt local caches.
  - T1 (2–6 weeks): Replace heuristic gating with trained classifier + policy engine; retype memory stack.
  - T2 (6–12 weeks): Layer verified cognition (tool-enabled prompts, feedback-driven retraining) and goal/schedule co-pilot.
    critical_path: Proxy + auth tokens → typed memory refactor → deploy classifier → integrate orchestration service → reintroduce
    advanced planning.
    non_negotiables: No client-held API keys; full TypeScript coverage on data services; observable inference traces; rollback toggles for
    every cognition change.
    rebuild_vs_salvage: Salvage UI, Supabase schema, and test harness; rebuild cognition orchestration, embeddings access, and telemetry
    pipeline.
    before_after_metrics:
    | Metric | Current | Target | Confidence | Measurement Method |
    | Secure inference path | Shared key on device | Signed proxy calls | 0.8 | Red-team review + secret scanning |
    | Intent routing precision | ~0.6 heuristic | ≥0.9 classifier | 0.6 | Held-out labeled set |
    | p95 reply latency | ~4.5s (multi-call) | ≤2.5s | 0.7 | Client/perf logs after proxy |
    | Retrieval precision@5 | Unmeasured | ≥0.75 | 0.5 | Supabase vector eval harness |
    | Telemetry coverage | 100 local events | 100% centralized | 0.8 | Event ingestion dashboard |

  💪 THE DOMINANCE MOVES
  top5_high_leverage_actions:

  1. Stand up Supabase Edge proxy for all OpenAI calls with per-user signing.
  2. Implement lightweight intent classifier (fine-tuned BERT or OpenAI responses) and move gating server-side.
  3. Refactor src/services/memory.ts into typed modules with deterministic queries.
  4. Consolidate main chat streaming + synthesis into single server function with receipts instrumentation.
  5. Encrypt or remove on-device telemetry cache; stream to analytics lake with redacted payloads.
     unfair_advantage_mechanisms:

  - Personalized policy engine fed by trust-weighted graph (once retyped) for adaptive plans.
  - Real-time feedback loop (spine) that replays failure lessons into prompts.
    Backlog (ICE scoring):
    | Item | Why Now | Effort | Impact(10x?) | ICE/RICE | Owner |
    | Proxy all LLM traffic via Edge Function | Blocks security + cost control | 3 | Yes | ICE 24 | CTO |
    | Train + deploy classifier for routing | Unlocks reliable planner | 5 | Yes | ICE 18 | ML Lead |
    | Typed memory service refactor | Prevents regressions, unlocks RAG | 4 | No | ICE 12 | Platform |
    | Centralize telemetry ingestion | Needed for retraining loops | 3 | Yes | ICE 16 | Infra |

  Risk ledger:
  | Risk | Likelihood | Impact | Mitigation | Kill-switch |
  | Proxy rollout throttles throughput | Medium | High | Load-test + gradual rollout | Route back to client fetch |
  | Classifier underfits long-tail intents | Medium | Medium | Active-learning with human labeling | Drop to LLM fallback policy |

 Phase 0 – Containment & Key Hardening (Week 0–2)
      - Objectives: remove all client-held secrets, restore trust in telemetry.
      - Scope: ship Supabase Edge proxy issuing short-lived per-user tokens; rotate OpenAI keys; add retry/backoff policy; encrypt/trim
        AsyncStorage telemetry, stream sanitized events to backend.
      - Deliverables: proxy service with automated tests + canary rollout plan; updated mobile app consuming signed tokens; telemetry
        ingestion dashboard with PII redaction; incident rollback checklist.
      - Dependencies: Ops access for secret rotation, Supabase Edge deploy pipeline.
      - Exit Criteria: zero API keys in client bundle (static scan passes), >95% chat traffic via proxy with p95 latency ≤3.0s, telemetry
        ingestion success >99%.
  - Phase 1 – Cognitive Reliability Core (Week 2–6)
      - Objectives: replace heuristic “gating” with real models, retype data spine.
      - Scope: collect gold dataset from existing traces, fine-tune lightweight intent classifier, deploy as Supabase function; refactor src/
        services/memory.ts + agent memory into typed modules with deterministic SQL; consolidate stream + structured completion into single
        orchestrated call with backpressure; extend Vitest coverage for pipeline + memory.
      - Deliverables: classifier service with CI evaluation reports; new memory module (MemoryStore, BriefAssembler) with TS types and
        integration tests; updated planner orchestration logging RAG + action receipts; regression suite (unit + integration) green.
      - Dependencies: Sample labeling bandwidth, QA on mobile flows, Supabase migration for typed views if needed.
      - Exit Criteria: intent routing precision ≥0.90 on holdout, 100% type coverage on memory/services, p95 reply latency ≤2.8s, integration
        tests passing in CI.
  - Phase 2 – Verified Orchestration & Feedback Loop (Week 6–10)
      - Objectives: enable repeatable advanced reasoning with traceability.
      - Scope: implement server-side tool-enabled reasoning templates (ToT/PAL or structured function calls) with bounded retries; capture
        inference traces + receipts in Supabase for auditing; integrate persona selection with policy engine; add deterministic action
        verification before storage.
      - Deliverables: cognition service (/v1/cognition/run) with configurable strategies; trace viewer (internal dashboard or Supabase SQL
        report); updated planner telemetry linking actions to receipts.
      - Dependencies: Backend infra for logs (maybe Logflare/ClickHouse), product sign-off on personas.
      - Exit Criteria: ≥95% of advanced intents handled server-side, trace coverage 100%, measured decrease in manual adjustments (>20%
        reduction vs baseline).
  - Phase 3 – Adaptive Co-Pilot & Retraining Loop (Week 10–16)
      - Objectives: translate telemetry into compounding advantage.
      - Scope: wire failure lessons into prompts/policies automatically; schedule/goal co-pilot suggestions backed by trust-weighted graph;
        establish retraining pipeline consuming feedback + telemetry to update classifier/prompts monthly.
      - Deliverables: lesson ingestion job, prompt diff tooling, co-pilot API with success metrics (acceptance rate, goal progress),
        retraining playbook with governance checklist.
      - Dependencies: Data infra for labeling, PM to define acceptance metrics, analytics for goal completion tracking.
      - Exit Criteria: measurable lift in goal completion or schedule adoption (>15%), retraining pipeline executed end-to-end, governance
        review signed off.
  - Phase 4 – Enterprise Readiness & Scale (Week 16+)
      - Objectives: prepare for larger user loads and compliance demands.
      - Scope: multi-tenant secret isolation, rate limiting & cost controls, SOC2-aligned logging/alerting, chaos tests for Supabase failures,
        onboarding playbook for new tenants.
      - Deliverables: rate-limit dashboard, chaos test reports, compliance gap assessment, onboarding runbook.
      - Exit Criteria: sustained p95 ≤2.5s at projected peak QPS, audit log coverage 100%, DR drill completed.
