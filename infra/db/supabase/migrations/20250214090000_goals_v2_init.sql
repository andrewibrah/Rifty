-- Living Goals v2 initial database changes
-- NOTE: new migration; do not modify prior migrations.

-- Enable pgvector for semantic embeddings.
CREATE EXTENSION IF NOT EXISTS vector;

-- Ensure goals table carries embedding vector for similarity search.
ALTER TABLE public.goals
    ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Ensure entries table carries embedding vector for similarity search.
ALTER TABLE public.entries
    ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Vector indexes for ANN search; re-create safely if already present.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_goals_embedding'
    ) THEN
        CREATE INDEX idx_goals_embedding
            ON public.goals
            USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 100);
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_entries_embedding'
    ) THEN
        CREATE INDEX idx_entries_embedding
            ON public.entries
            USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 200);
    END IF;
END$$;

-- Similarity helper for goal embeddings
CREATE OR REPLACE FUNCTION public.match_goal_embeddings(
    query_embedding vector(1536),
    match_user_id uuid,
    match_threshold float,
    match_count integer
)
RETURNS TABLE (
    goal_id uuid,
    title text,
    category text,
    status text,
    similarity float
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        g.id AS goal_id,
        g.title,
        g.category,
        g.status,
        1 - (g.embedding <=> query_embedding) AS similarity
    FROM public.goals g
    WHERE g.user_id = match_user_id
      AND g.embedding IS NOT NULL
      AND (
        match_threshold IS NULL
        OR 1 - (g.embedding <=> query_embedding) >= match_threshold
      )
    ORDER BY g.embedding <=> query_embedding
    LIMIT LEAST(GREATEST(match_count, 1), 25);
$$;

GRANT EXECUTE ON FUNCTION public.match_goal_embeddings(vector(1536), uuid, float, integer)
    TO anon, authenticated, service_role;

-- Capture reflections linked to goals and entries.
CREATE TABLE IF NOT EXISTS public.goal_reflections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
    entry_id UUID NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
    alignment_score NUMERIC NOT NULL CHECK (alignment_score BETWEEN 0 AND 1),
    emotion JSONB NOT NULL DEFAULT '{}'::jsonb,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, goal_id, entry_id)
);

CREATE INDEX IF NOT EXISTS idx_goal_reflections_user_goal ON public.goal_reflections (user_id, goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_reflections_user_entry ON public.goal_reflections (user_id, entry_id);
CREATE INDEX IF NOT EXISTS idx_goal_reflections_goal_created_at ON public.goal_reflections (goal_id, created_at DESC);

-- Cache table for progress and health metrics.
CREATE TABLE IF NOT EXISTS public.goal_progress_cache (
    goal_id UUID PRIMARY KEY REFERENCES public.goals(id) ON DELETE CASCADE,
    progress_pct NUMERIC NOT NULL DEFAULT 0,
    coherence_score NUMERIC NOT NULL DEFAULT 0,
    ghi_state TEXT NOT NULL DEFAULT 'unknown' CHECK (ghi_state IN ('alive', 'dormant', 'misaligned', 'complete', 'unknown')),
    last_computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sessions capturing AI conversations about goals.
CREATE TABLE IF NOT EXISTS public.ai_goal_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL,
    utterance TEXT NOT NULL,
    response_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_goal_sessions_user_created_at ON public.ai_goal_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_goal_sessions_goal_created_at ON public.ai_goal_sessions (goal_id, created_at DESC);

-- Optional stubs for future graph + normalized milestones support.
CREATE TABLE IF NOT EXISTS public.goal_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
    target_goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
    relationship TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goal_links_user ON public.goal_links (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_goal_links_pair ON public.goal_links (source_goal_id, target_goal_id);

CREATE TABLE IF NOT EXISTS public.milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed')) DEFAULT 'pending',
    due_date DATE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_milestones_goal_order ON public.milestones (goal_id, order_index);
CREATE INDEX IF NOT EXISTS idx_milestones_user_goal ON public.milestones (user_id, goal_id);

DROP TRIGGER IF EXISTS milestones_set_updated_at ON public.milestones;
CREATE TRIGGER milestones_set_updated_at
    BEFORE UPDATE ON public.milestones
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Calendar anchors for rhythmic reminders
CREATE TABLE IF NOT EXISTS public.goal_anchors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
    anchor_type TEXT NOT NULL CHECK (anchor_type IN ('check_in', 'milestone')),
    scheduled_for TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (goal_id, anchor_type, scheduled_for)
);

CREATE INDEX IF NOT EXISTS idx_goal_anchors_user_schedule
    ON public.goal_anchors (user_id, scheduled_for DESC);
CREATE INDEX IF NOT EXISTS idx_goal_anchors_goal_type
    ON public.goal_anchors (goal_id, anchor_type);

-- Enable RLS on new tables.
ALTER TABLE public.goal_reflections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_progress_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_goal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_anchors ENABLE ROW LEVEL SECURITY;

-- Policies for goal_reflections.
DROP POLICY IF EXISTS goal_reflections_select_own ON public.goal_reflections;
CREATE POLICY goal_reflections_select_own ON public.goal_reflections
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS goal_reflections_insert_own ON public.goal_reflections;
CREATE POLICY goal_reflections_insert_own ON public.goal_reflections
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS goal_reflections_update_own ON public.goal_reflections;
CREATE POLICY goal_reflections_update_own ON public.goal_reflections
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS goal_reflections_delete_own ON public.goal_reflections;
CREATE POLICY goal_reflections_delete_own ON public.goal_reflections
    FOR DELETE USING (auth.uid() = user_id);

-- Policies for goal_progress_cache (derive user via goal ownership).
DROP POLICY IF EXISTS goal_progress_cache_select_own ON public.goal_progress_cache;
CREATE POLICY goal_progress_cache_select_own ON public.goal_progress_cache
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.goals g
            WHERE g.id = goal_progress_cache.goal_id
              AND g.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS goal_progress_cache_change_own ON public.goal_progress_cache;
CREATE POLICY goal_progress_cache_change_own ON public.goal_progress_cache
    FOR ALL USING (
        EXISTS (
            SELECT 1
            FROM public.goals g
            WHERE g.id = goal_progress_cache.goal_id
              AND g.user_id = auth.uid()
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.goals g
            WHERE g.id = goal_progress_cache.goal_id
              AND g.user_id = auth.uid()
        )
    );

-- Policies for ai_goal_sessions.
DROP POLICY IF EXISTS ai_goal_sessions_select_own ON public.ai_goal_sessions;
CREATE POLICY ai_goal_sessions_select_own ON public.ai_goal_sessions
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ai_goal_sessions_insert_own ON public.ai_goal_sessions;
CREATE POLICY ai_goal_sessions_insert_own ON public.ai_goal_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS ai_goal_sessions_update_own ON public.ai_goal_sessions;
CREATE POLICY ai_goal_sessions_update_own ON public.ai_goal_sessions
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ai_goal_sessions_delete_own ON public.ai_goal_sessions;
CREATE POLICY ai_goal_sessions_delete_own ON public.ai_goal_sessions
    FOR DELETE USING (auth.uid() = user_id);

-- Policies for goal_links.
DROP POLICY IF EXISTS goal_links_select_own ON public.goal_links;
CREATE POLICY goal_links_select_own ON public.goal_links
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS goal_links_insert_own ON public.goal_links;
CREATE POLICY goal_links_insert_own ON public.goal_links
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS goal_links_update_own ON public.goal_links;
CREATE POLICY goal_links_update_own ON public.goal_links
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS goal_links_delete_own ON public.goal_links;
CREATE POLICY goal_links_delete_own ON public.goal_links
    FOR DELETE USING (auth.uid() = user_id);

-- Policies for milestones.
DROP POLICY IF EXISTS milestones_select_own ON public.milestones;
CREATE POLICY milestones_select_own ON public.milestones
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS milestones_insert_own ON public.milestones;
CREATE POLICY milestones_insert_own ON public.milestones
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS milestones_update_own ON public.milestones;
CREATE POLICY milestones_update_own ON public.milestones
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS milestones_delete_own ON public.milestones;
CREATE POLICY milestones_delete_own ON public.milestones
    FOR DELETE USING (auth.uid() = user_id);

-- Policies for goal anchors
DROP POLICY IF EXISTS goal_anchors_select_own ON public.goal_anchors;
CREATE POLICY goal_anchors_select_own ON public.goal_anchors
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS goal_anchors_insert_own ON public.goal_anchors;
CREATE POLICY goal_anchors_insert_own ON public.goal_anchors
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS goal_anchors_update_own ON public.goal_anchors;
CREATE POLICY goal_anchors_update_own ON public.goal_anchors
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS goal_anchors_delete_own ON public.goal_anchors;
CREATE POLICY goal_anchors_delete_own ON public.goal_anchors
    FOR DELETE USING (auth.uid() = user_id);
