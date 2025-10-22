-- Main chat rebrand migration: embeddings, feature store, events, anchors, and goal priority view
-- +goose Up
BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'schedule_blocks'
  ) THEN
    CREATE TABLE public.schedule_blocks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      goal_id uuid REFERENCES public.goals(id) ON DELETE SET NULL,
      intent text NOT NULL,
      summary text,
      start_at timestamptz NOT NULL,
      end_at timestamptz NOT NULL,
      location text,
      attendees text[] NOT NULL DEFAULT ARRAY[]::text[],
      receipts jsonb NOT NULL DEFAULT '{}'::jsonb,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_schedule_blocks_user_time
      ON public.schedule_blocks (user_id, start_at DESC);

    CREATE INDEX idx_schedule_blocks_goal
      ON public.schedule_blocks (goal_id, start_at DESC);

    CREATE INDEX idx_schedule_blocks_receipts_gin
      ON public.schedule_blocks USING gin (receipts);

    CREATE INDEX idx_schedule_blocks_metadata_gin
      ON public.schedule_blocks USING gin (metadata);

    DROP TRIGGER IF EXISTS schedule_blocks_set_updated_at ON public.schedule_blocks;
    CREATE TRIGGER schedule_blocks_set_updated_at
      BEFORE UPDATE ON public.schedule_blocks
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();

    ALTER TABLE public.schedule_blocks ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS schedule_blocks_select_own ON public.schedule_blocks;
    CREATE POLICY schedule_blocks_select_own ON public.schedule_blocks
      FOR SELECT USING (auth.uid() = user_id);

    DROP POLICY IF EXISTS schedule_blocks_modify_own ON public.schedule_blocks;
    CREATE POLICY schedule_blocks_modify_own ON public.schedule_blocks
      FOR ALL USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END$$;

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS semantic_vec vector(1536);
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS affect_vec vector(1536);
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS context_vec vector(1536);

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS semantic_vec vector(1536);
ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS affect_vec vector(1536);
ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS context_vec vector(1536);

ALTER TABLE public.schedule_blocks
  ADD COLUMN IF NOT EXISTS semantic_vec vector(1536);

CREATE TABLE IF NOT EXISTS public.features (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL,
  value_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_features_user
  ON public.features (user_id);

CREATE INDEX IF NOT EXISTS idx_features_value_json
  ON public.features USING gin (value_json);

DROP TRIGGER IF EXISTS features_set_updated_at ON public.features;
CREATE TRIGGER features_set_updated_at
  BEFORE UPDATE ON public.features
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS features_select_own ON public.features;
CREATE POLICY features_select_own ON public.features
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS features_upsert_own ON public.features;
CREATE POLICY features_upsert_own ON public.features
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  subject_type text NOT NULL,
  subject_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_user_created_at
  ON public.events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_subject
  ON public.events (subject_type, subject_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_payload_gin
  ON public.events USING gin (payload);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS events_select_own ON public.events;
CREATE POLICY events_select_own ON public.events
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS events_insert_own ON public.events;
CREATE POLICY events_insert_own ON public.events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.anchors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  pattern jsonb NOT NULL DEFAULT '{}'::jsonb,
  effectiveness_score numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_anchors_user_created_at
  ON public.anchors (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_anchors_pattern_gin
  ON public.anchors USING gin (pattern);

DROP TRIGGER IF EXISTS anchors_set_updated_at ON public.anchors;
CREATE TRIGGER anchors_set_updated_at
  BEFORE UPDATE ON public.anchors
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.anchors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anchors_select_own ON public.anchors;
CREATE POLICY anchors_select_own ON public.anchors
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS anchors_upsert_own ON public.anchors;
CREATE POLICY anchors_upsert_own ON public.anchors
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_goal_priority AS
SELECT
  g.id AS goal_id,
  g.user_id,
  g.status,
  g.target_date,
  g.updated_at,
  GREATEST(0, LEAST(1,
    COALESCE((g.metadata->>'priority')::numeric, 0.4) +
    COALESCE((g.metadata->>'urgency')::numeric, 0) * 0.2 +
    COALESCE((g.metadata->>'energy_cost')::numeric, 0) * -0.1 +
    CASE
      WHEN g.status = 'active' THEN 0.2
      WHEN g.status = 'paused' THEN -0.3
      WHEN g.status = 'archived' THEN -0.6
      ELSE 0
    END +
    CASE
      WHEN g.target_date IS NOT NULL AND g.target_date <= (current_date + INTERVAL '7 days') THEN 0.2
      WHEN g.target_date IS NOT NULL AND g.target_date <= (current_date + INTERVAL '21 days') THEN 0.1
      ELSE 0
    END +
    CASE
      WHEN g.updated_at >= (now() - INTERVAL '5 days') THEN 0.05
      WHEN g.updated_at >= (now() - INTERVAL '14 days') THEN -0.05
      ELSE -0.1
    END
  )) AS priority_score
FROM public.goals g;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_goal_priority_pk
  ON public.mv_goal_priority (goal_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'goals'
      AND column_name = 'semantic_vec'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_goals_semantic_vec'
  ) THEN
    CREATE INDEX idx_goals_semantic_vec
      ON public.goals
      USING ivfflat (semantic_vec vector_cosine_ops)
      WITH (lists = 100);
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'goals'
      AND column_name = 'affect_vec'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_goals_affect_vec'
  ) THEN
    CREATE INDEX idx_goals_affect_vec
      ON public.goals
      USING ivfflat (affect_vec vector_cosine_ops)
      WITH (lists = 100);
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'goals'
      AND column_name = 'context_vec'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_goals_context_vec'
  ) THEN
    CREATE INDEX idx_goals_context_vec
      ON public.goals
      USING ivfflat (context_vec vector_cosine_ops)
      WITH (lists = 100);
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'entries'
      AND column_name = 'semantic_vec'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_entries_semantic_vec'
  ) THEN
    CREATE INDEX idx_entries_semantic_vec
      ON public.entries
      USING ivfflat (semantic_vec vector_cosine_ops)
      WITH (lists = 200);
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'entries'
      AND column_name = 'affect_vec'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_entries_affect_vec'
  ) THEN
    CREATE INDEX idx_entries_affect_vec
      ON public.entries
      USING ivfflat (affect_vec vector_cosine_ops)
      WITH (lists = 200);
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'entries'
      AND column_name = 'context_vec'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_entries_context_vec'
  ) THEN
    CREATE INDEX idx_entries_context_vec
      ON public.entries
      USING ivfflat (context_vec vector_cosine_ops)
      WITH (lists = 200);
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'schedule_blocks'
      AND column_name = 'semantic_vec'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_schedule_blocks_semantic_vec'
  ) THEN
    CREATE INDEX idx_schedule_blocks_semantic_vec
      ON public.schedule_blocks
      USING ivfflat (semantic_vec vector_cosine_ops)
      WITH (lists = 50);
  END IF;
END$$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- +goose Down
BEGIN;

DROP INDEX IF EXISTS idx_schedule_blocks_semantic_vec;
DROP INDEX IF EXISTS idx_entries_context_vec;
DROP INDEX IF EXISTS idx_entries_affect_vec;
DROP INDEX IF EXISTS idx_entries_semantic_vec;
DROP INDEX IF EXISTS idx_goals_context_vec;
DROP INDEX IF EXISTS idx_goals_affect_vec;
DROP INDEX IF EXISTS idx_goals_semantic_vec;
DROP INDEX IF EXISTS idx_mv_goal_priority_pk;
DROP MATERIALIZED VIEW IF EXISTS public.mv_goal_priority;

DROP TABLE IF EXISTS public.anchors CASCADE;
DROP TABLE IF EXISTS public.events CASCADE;
DROP TABLE IF EXISTS public.features CASCADE;

ALTER TABLE IF EXISTS public.schedule_blocks
  DROP COLUMN IF EXISTS semantic_vec;

ALTER TABLE IF EXISTS public.entries
  DROP COLUMN IF EXISTS context_vec;
ALTER TABLE IF EXISTS public.entries
  DROP COLUMN IF EXISTS affect_vec;
ALTER TABLE IF EXISTS public.entries
  DROP COLUMN IF EXISTS semantic_vec;

ALTER TABLE IF EXISTS public.goals
  DROP COLUMN IF EXISTS context_vec;
ALTER TABLE IF EXISTS public.goals
  DROP COLUMN IF EXISTS affect_vec;
ALTER TABLE IF EXISTS public.goals
  DROP COLUMN IF EXISTS semantic_vec;

NOTIFY pgrst, 'reload schema';

COMMIT;
