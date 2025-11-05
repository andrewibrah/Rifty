# Riflett Spine UI Story

## Overview

- **Persona ribbon** now annotates each AI reply with the active cognition persona, gate route, and a concise plan summary. This keeps users aware of why a specific voice is responding without exposing chain-of-thought.
- **Feedback controls** sit under every AI bubble. Ratings (helpful / neutral / needs work) can include optional correction text and tags, queueing safely when offline and refreshing `riflett_feedback_stats` when the submission succeeds.
- **Context compass** appears when the AI composer gains focus. It debounces Supabase `context_rebuilder`, surfaces recent modes, top topics, and trustworthy evidence nodes (trust ≥ 0.4), and highlights fatigue recall whenever the input resembles “tired again”.
- **Lesson ribbon** rotates through the three latest lessons returned by `failure_tracker` whenever a failure is recorded (unhelpful feedback or router fault), and dismisses per session.
- **Latency toasts** pop near the composer with tiered colour hints (<500ms, 500–1500ms, >1500ms) and a hidden long-press to copy the `ai_event_id` for diagnostics.

## Local Storybook / Testing Notes

1. Seed Supabase with demo data:
   ```bash
   npx ts-node scripts/seed_demo.ts
   ```
   The `scripts/seed_demo.ts` helper provisions a demo user, reflective entries, and primes the memory graph so the context compass has data to render.
2. Run the targeted unit suite to validate heuristics and retry logic:
   ```bash
   npx vitest run tests/unit/contextCompassPanel.test.ts tests/unit/feedbackReducer.test.ts tests/unit/retry.test.ts
   ```
3. Storybook documentation for the new UI components lives under `docs/spine_ui_story.md` (this file) and references the menu chat surface in Expo.

## Interaction Flow Summary

- Ask Riflett a question → observe persona badge + plan summary in the reply.
- Provide feedback (e.g., “Needs work”) → correction field appears, tags optional, offline queue kicks in if network/auth is missing.
- Mark feedback unhelpful → lesson ribbon animates in with the latest scoped lessons.
- Focus the composer → context compass expands with current modes and evidence; fatigue cues produce a yellow banner.
- Long-press the latency toast → `ai_event_id` copies to the clipboard for debugging.
