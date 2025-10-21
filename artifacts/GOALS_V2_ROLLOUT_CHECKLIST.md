# Living Goals v2 Rollout Checklist

- [ ] Run migrations: `supabase migration up` (ensures goal_reflections, goal_progress_cache, goal_anchors, etc.).
- [ ] Verify pgvector extension and ivfflat indexes (`idx_goals_embedding`, `idx_entries_embedding`).
- [ ] Deploy edge functions: `supabase functions deploy link_reflections compute_goal_health main_chat_goal_recall`.
- [ ] Configure schedules:
  - Nightly `compute_goal_health` at 02:20 local.
  - Hourly sweep invoking `link_reflections` for unprocessed entries.
  - Weekly ivfflat reindex job.
- [ ] Set environment flags: `RIFLETT_GOALS_V2=true`, `RIFLETT_LINK_THRESHOLD=0.82`, `RIFLETT_DEDUPE_THRESHOLD=0.90`.
- [ ] Warm caches: run backfill script to embed historic entries/goals and call `compute_goal_health` once.
- [ ] Announce UI change: enable feature flag for pilot cohort, monitor compute job duration (<5m per 1k goals).
- [ ] Final QA: export payload includes reflections/health timeline; chat recall + rhythm reset paths verified.
