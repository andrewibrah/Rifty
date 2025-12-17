-- Riflett intelligence spine: feedback loops, memory graph, trust, and failure audits
-- This migration is additive and keeps existing tables intact.

-- Required extensions for vector search and fuzzy text matching.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enumerations for consistent state handling.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'riflett_feedback_label') THEN
    CREATE TYPE public.riflett_feedback_label AS ENUM ('helpful', 'unhelpful', 'neutral');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'riflett_memory_node_type') THEN
    CREATE TYPE public.riflett_memory_node_type AS ENUM ('entry', 'goal', 'topic', 'mood', 'anchor');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'riflett_failure_type') THEN
    CREATE TYPE public.riflett_failure_type AS ENUM (
      'wrong_intent',
      'bad_data',
      'poor_reasoning',
      'confused_context',
      'other'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'riflett_lesson_scope') THEN
    CREATE TYPE public.riflett_lesson_scope AS ENUM ('intent', 'routing', 'style', 'safety');
  END IF;
END
$$;

-- Base tables for AI event capture and feedback.
CREATE TABLE IF NOT EXISTS public.riflett_ai_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  intent TEXT NOT NULL,
  input TEXT NOT NULL,
  output_json JSONB NOT NULL,
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  model TEXT,
  temperature NUMERIC,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_riflett_ai_event_user_created
  ON public.riflett_ai_event (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_riflett_ai_event_intent
  ON public.riflett_ai_event (intent);

ALTER TABLE public.riflett_ai_event ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS riflett_ai_event_select_own ON public.riflett_ai_event;
CREATE POLICY riflett_ai_event_select_own ON public.riflett_ai_event
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS riflett_ai_event_insert_own ON public.riflett_ai_event;
CREATE POLICY riflett_ai_event_insert_own ON public.riflett_ai_event
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Feedback table capturing user signals on AI outputs.
CREATE TABLE IF NOT EXISTS public.riflett_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ai_event_id UUID NOT NULL REFERENCES public.riflett_ai_event(id) ON DELETE CASCADE,
  label public.riflett_feedback_label NOT NULL,
  correction TEXT,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  confidence_from_model NUMERIC CHECK (confidence_from_model IS NULL OR (confidence_from_model >= 0 AND confidence_from_model <= 1)),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_riflett_feedback_user_created
  ON public.riflett_feedback (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_riflett_feedback_event
  ON public.riflett_feedback (ai_event_id);
CREATE INDEX IF NOT EXISTS idx_riflett_feedback_label
  ON public.riflett_feedback (label);

ALTER TABLE public.riflett_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS riflett_feedback_select_own ON public.riflett_feedback;
CREATE POLICY riflett_feedback_select_own ON public.riflett_feedback
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS riflett_feedback_insert_own ON public.riflett_feedback;
CREATE POLICY riflett_feedback_insert_own ON public.riflett_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS riflett_feedback_update_self ON public.riflett_feedback;
CREATE POLICY riflett_feedback_update_self ON public.riflett_feedback
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS riflett_feedback_delete_self ON public.riflett_feedback;
CREATE POLICY riflett_feedback_delete_self ON public.riflett_feedback
  FOR DELETE USING (auth.uid() = user_id);

-- Memory graph nodes and edges.
CREATE TABLE IF NOT EXISTS public.riflett_memory_node (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_entry_id UUID REFERENCES public.entries(id) ON DELETE CASCADE,
  related_goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL,
  type public.riflett_memory_node_type NOT NULL,
  text TEXT NOT NULL,
  text_hash TEXT GENERATED ALWAYS AS (md5(text)) STORED,
  embedding vector(1536),
  trust_weight NUMERIC NOT NULL DEFAULT 0.7 CHECK (trust_weight >= 0 AND trust_weight <= 1),
  confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  sentiment NUMERIC DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, source_entry_id),
  UNIQUE (user_id, type, text_hash)
);

CREATE INDEX IF NOT EXISTS idx_riflett_memory_node_user_type
  ON public.riflett_memory_node (user_id, type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_riflett_memory_node_goal
  ON public.riflett_memory_node (related_goal_id);
CREATE INDEX IF NOT EXISTS idx_riflett_memory_node_trust
  ON public.riflett_memory_node (user_id, trust_weight DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_riflett_memory_node_embedding'
  ) THEN
    CREATE INDEX idx_riflett_memory_node_embedding
      ON public.riflett_memory_node
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 200);
  END IF;
END
$$;

ALTER TABLE public.riflett_memory_node ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS riflett_memory_node_select_own ON public.riflett_memory_node;
CREATE POLICY riflett_memory_node_select_own ON public.riflett_memory_node
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS riflett_memory_node_mutate_own ON public.riflett_memory_node;
CREATE POLICY riflett_memory_node_mutate_own ON public.riflett_memory_node
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS riflett_memory_node_set_updated_at ON public.riflett_memory_node;
CREATE TRIGGER riflett_memory_node_set_updated_at
  BEFORE UPDATE ON public.riflett_memory_node
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.riflett_match_memory_nodes(
  query_embedding vector(1536),
  match_user_id UUID,
  match_count INTEGER DEFAULT 5,
  min_score NUMERIC DEFAULT 0.35
)
RETURNS TABLE (
  node_id UUID,
  score NUMERIC,
  node_type public.riflett_memory_node_type,
  text TEXT,
  trust_weight NUMERIC,
  sentiment NUMERIC,
  metadata JSONB
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    n.id AS node_id,
    1 - (n.embedding <=> query_embedding) AS score,
    n.type AS node_type,
    n.text,
    n.trust_weight,
    n.sentiment,
    n.metadata
  FROM public.riflett_memory_node AS n
  WHERE n.user_id = match_user_id
    AND n.embedding IS NOT NULL
    AND (
      min_score IS NULL
      OR 1 - (n.embedding <=> query_embedding) >= min_score
    )
  ORDER BY n.embedding <=> query_embedding
  LIMIT CASE
    WHEN match_count IS NULL OR match_count <= 0 THEN 5
    ELSE LEAST(match_count, 50)
  END;
$$;

GRANT EXECUTE ON FUNCTION public.riflett_match_memory_nodes(vector(1536), UUID, INTEGER, NUMERIC)
  TO service_role;

CREATE TABLE IF NOT EXISTS public.riflett_memory_edge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  src_id UUID NOT NULL REFERENCES public.riflett_memory_node(id) ON DELETE CASCADE,
  dst_id UUID NOT NULL REFERENCES public.riflett_memory_node(id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  weight NUMERIC NOT NULL DEFAULT 0.5 CHECK (weight >= 0 AND weight <= 1),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, src_id, dst_id, relation)
);

CREATE INDEX IF NOT EXISTS idx_riflett_memory_edge_user_src
  ON public.riflett_memory_edge (user_id, src_id);
CREATE INDEX IF NOT EXISTS idx_riflett_memory_edge_user_dst
  ON public.riflett_memory_edge (user_id, dst_id);
CREATE INDEX IF NOT EXISTS idx_riflett_memory_edge_weight
  ON public.riflett_memory_edge (user_id, weight DESC);

CREATE INDEX IF NOT EXISTS idx_riflett_memory_edge_relation_gin
  ON public.riflett_memory_edge
  USING GIN (relation gin_trgm_ops);

ALTER TABLE public.riflett_memory_edge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS riflett_memory_edge_select_own ON public.riflett_memory_edge;
CREATE POLICY riflett_memory_edge_select_own ON public.riflett_memory_edge
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS riflett_memory_edge_mutate_own ON public.riflett_memory_edge;
CREATE POLICY riflett_memory_edge_mutate_own ON public.riflett_memory_edge
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS riflett_memory_edge_set_updated_at ON public.riflett_memory_edge;
CREATE TRIGGER riflett_memory_edge_set_updated_at
  BEFORE UPDATE ON public.riflett_memory_edge
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Context snapshots capture what was sent back to the client for transparency.
CREATE TABLE IF NOT EXISTS public.riflett_context_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  input_text TEXT NOT NULL,
  output_json JSONB NOT NULL,
  version TEXT NOT NULL DEFAULT 'spine.v1',
  diagnostics JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_riflett_context_snapshot_user_created
  ON public.riflett_context_snapshot (user_id, created_at DESC);

ALTER TABLE public.riflett_context_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS riflett_context_snapshot_select_own ON public.riflett_context_snapshot;
CREATE POLICY riflett_context_snapshot_select_own ON public.riflett_context_snapshot
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS riflett_context_snapshot_insert_own ON public.riflett_context_snapshot;
CREATE POLICY riflett_context_snapshot_insert_own ON public.riflett_context_snapshot
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Failure and lesson tracking.
CREATE TABLE IF NOT EXISTS public.riflett_failure (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ai_event_id UUID REFERENCES public.riflett_ai_event(id) ON DELETE SET NULL,
  failure_type public.riflett_failure_type NOT NULL,
  signal TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_riflett_failure_user_created
  ON public.riflett_failure (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_riflett_failure_event
  ON public.riflett_failure (ai_event_id);

ALTER TABLE public.riflett_failure ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS riflett_failure_select_own ON public.riflett_failure;
CREATE POLICY riflett_failure_select_own ON public.riflett_failure
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS riflett_failure_insert_own ON public.riflett_failure;
CREATE POLICY riflett_failure_insert_own ON public.riflett_failure
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.riflett_lesson (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_text TEXT NOT NULL,
  scope public.riflett_lesson_scope NOT NULL,
  source_failure_id UUID REFERENCES public.riflett_failure(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_riflett_lesson_user_created
  ON public.riflett_lesson (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_riflett_lesson_scope
  ON public.riflett_lesson (scope);

ALTER TABLE public.riflett_lesson ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS riflett_lesson_select_own ON public.riflett_lesson;
CREATE POLICY riflett_lesson_select_own ON public.riflett_lesson
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS riflett_lesson_insert_own ON public.riflett_lesson;
CREATE POLICY riflett_lesson_insert_own ON public.riflett_lesson
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Dashboard view: recent failures grouped by type with time-to-fix heuristics.
CREATE OR REPLACE VIEW public.riflett_failure_dashboard AS
WITH ranked_failures AS (
  SELECT
    f.*,
    ROW_NUMBER() OVER (PARTITION BY f.user_id ORDER BY f.created_at DESC) AS rn
  FROM public.riflett_failure AS f
),
limited_failures AS (
  SELECT *
  FROM ranked_failures
  WHERE rn <= 50
),
time_to_fix AS (
  SELECT
    lf.id AS failure_id,
    lf.user_id,
    lf.failure_type,
    lf.created_at,
    MIN(l.created_at) AS lesson_created_at,
    EXTRACT(EPOCH FROM (MIN(l.created_at) - lf.created_at)) / 60 AS minutes_to_fix
  FROM limited_failures AS lf
  LEFT JOIN public.riflett_lesson AS l
    ON l.source_failure_id = lf.id
  GROUP BY lf.id, lf.user_id, lf.failure_type, lf.created_at
)
SELECT
  t.user_id,
  t.failure_type,
  COUNT(*) AS failure_count,
  COUNT(*) FILTER (WHERE t.lesson_created_at IS NOT NULL) AS failures_with_lessons,
  AVG(t.minutes_to_fix) FILTER (WHERE t.minutes_to_fix IS NOT NULL) AS avg_minutes_to_fix,
  MAX(t.created_at) AS last_failure_at
FROM time_to_fix AS t
GROUP BY t.user_id, t.failure_type;

-- Trust weighting helper.
CREATE OR REPLACE FUNCTION public.riflett_trust(
  recency_days NUMERIC,
  confirmed BOOLEAN,
  sentiment NUMERIC
)
RETURNS NUMERIC
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT LEAST(
    1,
    GREATEST(
      0,
      0.35
        + 0.4 * (1 / (1 + COALESCE(recency_days, 0) / 7))
        + CASE WHEN confirmed THEN 0.2 ELSE 0 END
        + 0.05 * COALESCE(sentiment, 0)
    )
  )
$$;

COMMENT ON FUNCTION public.riflett_trust IS
  'Computes trust weight based on recency, confirmation, and sentiment.';

CREATE OR REPLACE FUNCTION public.riflett_recompute_trust_weights()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  WITH updated AS (
    UPDATE public.riflett_memory_node AS n
    SET
      trust_weight = public.riflett_trust(
        EXTRACT(EPOCH FROM (NOW() - COALESCE(n.updated_at, n.created_at))) / 86400,
        n.confirmed,
        n.sentiment
      ),
      updated_at = NOW()
    RETURNING 1
  )
  SELECT COUNT(*) INTO updated_count FROM updated;

  RETURN COALESCE(updated_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.riflett_recompute_trust_weights() TO service_role;

-- Materialized view for rolling feedback statistics.
CREATE MATERIALIZED VIEW IF NOT EXISTS public.riflett_feedback_stats AS
WITH window_params AS (
  SELECT * FROM (VALUES
    ('7d'::TEXT, INTERVAL '7 days'),
    ('30d'::TEXT, INTERVAL '30 days'),
    ('90d'::TEXT, INTERVAL '90 days')
  ) AS params(window_label, window_interval)
),
aggregated AS (
  SELECT
    f.user_id,
    params.window_label AS window_label,
    COUNT(*) FILTER (WHERE f.label = 'helpful') AS helpful_count,
    COUNT(*) FILTER (WHERE f.label = 'unhelpful') AS unhelpful_count,
    COUNT(*) FILTER (WHERE f.label = 'neutral') AS neutral_count,
    AVG(f.confidence_from_model) AS avg_confidence,
    MAX(f.created_at) AS last_feedback_at
  FROM public.riflett_feedback AS f
  JOIN window_params AS params
    ON f.created_at >= NOW() - params.window_interval
  GROUP BY f.user_id, params.window_label
)
SELECT
  aggregated.user_id,
  aggregated.window_label,
  aggregated.helpful_count,
  aggregated.unhelpful_count,
  aggregated.neutral_count,
  (aggregated.helpful_count + aggregated.unhelpful_count + aggregated.neutral_count) AS total_count,
  CASE
    WHEN (aggregated.helpful_count + aggregated.unhelpful_count) > 0
      THEN aggregated.helpful_count::NUMERIC / (aggregated.helpful_count + aggregated.unhelpful_count)
    ELSE NULL
  END AS accuracy,
  aggregated.avg_confidence,
  aggregated.last_feedback_at,
  NOW() AS refreshed_at
FROM aggregated;

CREATE UNIQUE INDEX IF NOT EXISTS idx_riflett_feedback_stats_user_window
  ON public.riflett_feedback_stats (user_id, window_label);

CREATE OR REPLACE FUNCTION public.refresh_riflett_feedback_stats()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.riflett_feedback_stats;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_riflett_feedback_stats() TO service_role;

-- Notification helper to fan out inserts.
CREATE OR REPLACE FUNCTION public.riflett_emit_feedback_notification(
  feedback_id UUID,
  ai_event_id UUID,
  user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payload JSONB;
BEGIN
  payload := jsonb_build_object(
    'feedback_id', feedback_id,
    'ai_event_id', ai_event_id,
    'user_id', user_id,
    'emitted_at', NOW()
  );
  PERFORM pg_notify('feedback_insert', payload::TEXT);
END;
$$;

GRANT EXECUTE ON FUNCTION public.riflett_emit_feedback_notification(UUID, UUID, UUID) TO service_role;

-- Helper to prune edges once nodes exceed configured degree.
CREATE OR REPLACE FUNCTION public.riflett_prune_edges(p_node_id UUID, p_user_id UUID, p_limit INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.riflett_memory_edge
  WHERE id IN (
    SELECT id
    FROM public.riflett_memory_edge
    WHERE user_id = p_user_id
      AND (src_id = p_node_id OR dst_id = p_node_id)
    ORDER BY created_at DESC
    OFFSET GREATEST(p_limit, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.riflett_prune_edges(UUID, UUID, INTEGER) TO service_role;

-- Memory graph upsert: derives nodes and relations from a source entry.
CREATE OR REPLACE FUNCTION public.memory_graph_upsert(p_entry_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry RECORD;
  v_entry_embedding vector(1536);
  v_topics TEXT[];
  v_mood TEXT;
  v_topic TEXT;
  v_entry_node_id UUID;
  v_topic_node_id UUID;
  v_mood_node_id UUID;
  v_degree_cap CONSTANT INTEGER := 24;
  v_sentiment NUMERIC := 0;
  v_metadata JSONB := '{}'::JSONB;
BEGIN
  SELECT
    e.id,
    e.user_id,
    e.content,
    e.type,
    e.mood,
    e.metadata,
    es.summary,
    es.topics,
    es.emotion,
    es.urgency_level,
    ee.embedding
  INTO v_entry
  FROM public.entries AS e
  LEFT JOIN public.entry_summaries AS es ON es.entry_id = e.id
  LEFT JOIN public.entry_embeddings AS ee ON ee.entry_id = e.id
  WHERE e.id = p_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'memory_graph_upsert: entry % not found', p_entry_id;
  END IF;

  v_entry_embedding := v_entry.embedding;
  v_topics := COALESCE(v_entry.topics, ARRAY[]::TEXT[]);
  v_mood := COALESCE(v_entry.mood, v_entry.emotion);

  IF v_entry.emotion IS NOT NULL THEN
    v_sentiment :=
      CASE LOWER(v_entry.emotion)
        WHEN 'joyful' THEN 0.6
        WHEN 'happy' THEN 0.5
        WHEN 'content' THEN 0.25
        WHEN 'anxious' THEN -0.2
        WHEN 'stressed' THEN -0.4
        WHEN 'sad' THEN -0.5
        WHEN 'tired' THEN -0.3
        ELSE 0
      END;
  END IF;

  v_metadata := jsonb_build_object(
    'entry_type', v_entry.type,
    'summary', COALESCE(v_entry.summary, NULL),
    'urgency_level', COALESCE(v_entry.urgency_level, NULL)
  );

  INSERT INTO public.riflett_memory_node AS n (
    user_id,
    source_entry_id,
    type,
    text,
    embedding,
    trust_weight,
    sentiment,
    metadata
  )
  VALUES (
    v_entry.user_id,
    v_entry.id,
    'entry',
    LEFT(v_entry.content, 4000),
    v_entry_embedding,
    public.riflett_trust(0, FALSE, v_sentiment),
    v_sentiment,
    v_metadata
  )
  ON CONFLICT (user_id, source_entry_id)
  DO UPDATE SET
    text = LEFT(EXCLUDED.text, 4000),
    embedding = COALESCE(EXCLUDED.embedding, public.riflett_memory_node.embedding),
    sentiment = EXCLUDED.sentiment,
    metadata = EXCLUDED.metadata,
    updated_at = NOW()
  RETURNING id INTO v_entry_node_id;

  PERFORM public.riflett_prune_edges(v_entry_node_id, v_entry.user_id, v_degree_cap);

  FOREACH v_topic IN ARRAY v_topics LOOP
    v_topic := trim(lower(v_topic));
    IF v_topic IS NULL OR v_topic = '' THEN
      CONTINUE;
    END IF;

    INSERT INTO public.riflett_memory_node AS tn (
      user_id,
      type,
      text,
      trust_weight,
      metadata
    )
    VALUES (
      v_entry.user_id,
      'topic',
      v_topic,
      0.7,
      jsonb_build_object('source_entry_id', v_entry.id)
    )
    ON CONFLICT (user_id, type, text_hash)
    DO UPDATE SET
      trust_weight = LEAST(1, riflett_memory_node.trust_weight * 0.8 + EXCLUDED.trust_weight * 0.2),
      metadata = riflett_memory_node.metadata || EXCLUDED.metadata,
      updated_at = NOW()
    RETURNING id INTO v_topic_node_id;

    INSERT INTO public.riflett_memory_edge AS e (
      user_id,
      src_id,
      dst_id,
      relation,
      weight,
      metadata
    )
    VALUES (
      v_entry.user_id,
      v_entry_node_id,
      v_topic_node_id,
      'mentions',
      LEAST(1, 0.6 + COALESCE(v_entry.urgency_level, 0)::NUMERIC / 20),
      jsonb_build_object('entry_id', v_entry.id)
    )
    ON CONFLICT (user_id, src_id, dst_id, relation)
    DO UPDATE SET
      weight = LEAST(1, riflett_memory_edge.weight * 0.7 + EXCLUDED.weight * 0.3),
      metadata = riflett_memory_edge.metadata || EXCLUDED.metadata,
      updated_at = NOW();

    PERFORM public.riflett_prune_edges(v_topic_node_id, v_entry.user_id, v_degree_cap);
  END LOOP;

  IF v_mood IS NOT NULL AND length(trim(v_mood)) > 0 THEN
    INSERT INTO public.riflett_memory_node AS mn (
      user_id,
      type,
      text,
      trust_weight,
      metadata
    )
    VALUES (
      v_entry.user_id,
      'mood',
      lower(trim(v_mood)),
      0.65,
      jsonb_build_object('source_entry_id', v_entry.id)
    )
    ON CONFLICT (user_id, type, text_hash)
    DO UPDATE SET
      trust_weight = LEAST(1, riflett_memory_node.trust_weight * 0.75 + EXCLUDED.trust_weight * 0.25),
      metadata = riflett_memory_node.metadata || EXCLUDED.metadata,
      updated_at = NOW()
    RETURNING id INTO v_mood_node_id;

    INSERT INTO public.riflett_memory_edge AS me (
      user_id,
      src_id,
      dst_id,
      relation,
      weight,
      metadata
    )
    VALUES (
      v_entry.user_id,
      v_entry_node_id,
      v_mood_node_id,
      'feels',
      0.6,
      jsonb_build_object('entry_id', v_entry.id)
    )
    ON CONFLICT (user_id, src_id, dst_id, relation)
    DO UPDATE SET
      weight = LEAST(1, riflett_memory_edge.weight * 0.5 + EXCLUDED.weight * 0.5),
      metadata = riflett_memory_edge.metadata || EXCLUDED.metadata,
      updated_at = NOW();

    PERFORM public.riflett_prune_edges(v_mood_node_id, v_entry.user_id, v_degree_cap);
  END IF;

  RETURN v_entry_node_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.memory_graph_upsert(UUID) TO service_role;
