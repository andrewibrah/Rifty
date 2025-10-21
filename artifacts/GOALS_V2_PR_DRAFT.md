## Summary
- Introduce Living Goals v2 data model expansions (reflections, progress cache, AI sessions, anchors) with pgvector search helpers.
- Ship unified goal pipeline across RN + edge functions, semantic linking of entries to goals, health computation, chat recall, and calendar anchors.
- Refresh Goals panel UX with coherence bars, badges, reflection snippets, and rhythm reset CTA; extend export payload to v2 schema.

## Testing
- `npm run test:codex`

## Feature Flags
- `RIFLETT_GOALS_V2` (enables v2 pipeline, UI, edge integrations).
- `RIFLETT_LINK_THRESHOLD`
- `RIFLETT_DEDUPE_THRESHOLD`

## Migrations
- `20250214090000_goals_v2_init.sql`
  - Adds goal embeddings, reflections, progress cache, AI sessions, goal links, milestones, anchors, and associated policies/indexes.

## Rollback
- Disable `RIFLETT_GOALS_V2` to revert to legacy UI/workflows.
- Drop/ignore new tables if necessary (`goal_reflections`, `goal_progress_cache`, `ai_goal_sessions`, `goal_links`, `milestones`, `goal_anchors`).
- Remove scheduled jobs invoking new edge functions.
