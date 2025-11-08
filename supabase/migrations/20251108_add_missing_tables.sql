-- Create features table
CREATE TABLE IF NOT EXISTS public.features (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL,
  value_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_features_user ON public.features (user_id);
CREATE INDEX IF NOT EXISTS idx_features_value_json ON public.features USING gin (value_json);

ALTER TABLE public.features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS features_select_own ON public.features;
CREATE POLICY features_select_own ON public.features
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS features_upsert_own ON public.features;
CREATE POLICY features_upsert_own ON public.features
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create events table
CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  subject_type text NOT NULL,
  subject_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_user_created_at ON public.events (user_id, created_at DESC);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS events_select_own ON public.events;
CREATE POLICY events_select_own ON public.events
  FOR SELECT USING (auth.uid() = user_id);

-- Create mv_goal_priority materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_goal_priority AS
WITH goal_activity AS (
  SELECT
    g.id AS goal_id,
    g.user_id,
    COUNT(DISTINCT gr.entry_id) AS reflection_count,
    COALESCE(MAX(gr.created_at), g.created_at) AS last_activity,
    COALESCE(AVG(gr.alignment_score), 0.5) AS avg_alignment
  FROM public.goals g
  LEFT JOIN public.goal_reflections gr ON gr.goal_id = g.id
  WHERE g.status = 'active'
  GROUP BY g.id, g.user_id, g.created_at
)
SELECT
  ga.goal_id,
  ga.user_id,
  (
    (CASE WHEN ga.reflection_count > 0 THEN 50 ELSE 0 END) +
    (CASE WHEN ga.last_activity > (now() - interval '7 days') THEN 30 ELSE 0 END) +
    (ga.avg_alignment * 20)
  )::numeric AS priority_score
FROM goal_activity ga;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_goal_priority_pk ON public.mv_goal_priority (goal_id);
CREATE INDEX IF NOT EXISTS idx_mv_goal_priority_user ON public.mv_goal_priority (user_id);
CREATE INDEX IF NOT EXISTS idx_mv_goal_priority_score ON public.mv_goal_priority (priority_score DESC);
