-- Ensure PostgREST can see semantic memory tables even if previous migration skipped

CREATE EXTENSION IF NOT EXISTS vector;

DO $do$
BEGIN
    -- Entry summaries -----------------------------------------------------
    EXECUTE $ddl$
        CREATE TABLE IF NOT EXISTS public.entry_summaries (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            entry_id UUID NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            summary TEXT NOT NULL,
            emotion TEXT,
            topics TEXT[] DEFAULT ARRAY[]::TEXT[],
            people TEXT[] DEFAULT ARRAY[]::TEXT[],
            urgency_level INTEGER CHECK (urgency_level >= 0 AND urgency_level <= 10),
            suggested_action TEXT,
            blockers TEXT,
            dates_mentioned TEXT[],
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(entry_id)
        )
    $ddl$;

    EXECUTE $ddl$
        CREATE INDEX IF NOT EXISTS idx_entry_summaries_entry
            ON public.entry_summaries(entry_id)
    $ddl$;

    EXECUTE $ddl$
        CREATE INDEX IF NOT EXISTS idx_entry_summaries_user
            ON public.entry_summaries(user_id, created_at DESC)
    $ddl$;

    EXECUTE $ddl$
        CREATE INDEX IF NOT EXISTS idx_entry_summaries_emotion
            ON public.entry_summaries(emotion)
    $ddl$;

    EXECUTE $ddl$
        CREATE INDEX IF NOT EXISTS idx_entry_summaries_topics
            ON public.entry_summaries USING GIN(topics)
    $ddl$;

    EXECUTE $ddl$
        DROP TRIGGER IF EXISTS entry_summaries_set_updated_at ON public.entry_summaries
    $ddl$;

    EXECUTE $ddl$
        CREATE TRIGGER entry_summaries_set_updated_at
            BEFORE UPDATE ON public.entry_summaries
            FOR EACH ROW
            EXECUTE FUNCTION public.set_updated_at()
    $ddl$;

    EXECUTE $ddl$
        ALTER TABLE public.entry_summaries ENABLE ROW LEVEL SECURITY
    $ddl$;

    EXECUTE $ddl$
        DROP POLICY IF EXISTS entry_summaries_select_own ON public.entry_summaries
    $ddl$;

    EXECUTE $ddl$
        CREATE POLICY entry_summaries_select_own ON public.entry_summaries
            FOR SELECT USING (auth.uid() = user_id)
    $ddl$;

    EXECUTE $ddl$
        DROP POLICY IF EXISTS entry_summaries_insert_own ON public.entry_summaries
    $ddl$;

    EXECUTE $ddl$
        CREATE POLICY entry_summaries_insert_own ON public.entry_summaries
            FOR INSERT WITH CHECK (auth.uid() = user_id)
    $ddl$;

    EXECUTE $ddl$
        DROP POLICY IF EXISTS entry_summaries_update_own ON public.entry_summaries
    $ddl$;

    EXECUTE $ddl$
        CREATE POLICY entry_summaries_update_own ON public.entry_summaries
            FOR UPDATE USING (auth.uid() = user_id)
    $ddl$;

    EXECUTE $ddl$
        DROP POLICY IF EXISTS entry_summaries_delete_own ON public.entry_summaries
    $ddl$;

    EXECUTE $ddl$
        CREATE POLICY entry_summaries_delete_own ON public.entry_summaries
            FOR DELETE USING (auth.uid() = user_id)
    $ddl$;

    -- Entry embeddings ----------------------------------------------------
    EXECUTE $ddl$
        CREATE TABLE IF NOT EXISTS public.entry_embeddings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            entry_id UUID NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            embedding vector(1536),
            model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(entry_id)
        )
    $ddl$;

    EXECUTE $ddl$
        CREATE INDEX IF NOT EXISTS idx_entry_embeddings_entry
            ON public.entry_embeddings(entry_id)
    $ddl$;

    EXECUTE $ddl$
        CREATE INDEX IF NOT EXISTS idx_entry_embeddings_user
            ON public.entry_embeddings(user_id)
    $ddl$;

    EXECUTE $ddl$
        ALTER TABLE public.entry_embeddings ENABLE ROW LEVEL SECURITY
    $ddl$;

    EXECUTE $ddl$
        DROP POLICY IF EXISTS entry_embeddings_select_own ON public.entry_embeddings
    $ddl$;

    EXECUTE $ddl$
        CREATE POLICY entry_embeddings_select_own ON public.entry_embeddings
            FOR SELECT USING (auth.uid() = user_id)
    $ddl$;

    EXECUTE $ddl$
        DROP POLICY IF EXISTS entry_embeddings_insert_own ON public.entry_embeddings
    $ddl$;

    EXECUTE $ddl$
        CREATE POLICY entry_embeddings_insert_own ON public.entry_embeddings
            FOR INSERT WITH CHECK (auth.uid() = user_id)
    $ddl$;

    EXECUTE $ddl$
        DROP POLICY IF EXISTS entry_embeddings_update_own ON public.entry_embeddings
    $ddl$;

    EXECUTE $ddl$
        CREATE POLICY entry_embeddings_update_own ON public.entry_embeddings
            FOR UPDATE USING (auth.uid() = user_id)
    $ddl$;

    EXECUTE $ddl$
        DROP POLICY IF EXISTS entry_embeddings_delete_own ON public.entry_embeddings
    $ddl$;

    EXECUTE $ddl$
        CREATE POLICY entry_embeddings_delete_own ON public.entry_embeddings
            FOR DELETE USING (auth.uid() = user_id)
    $ddl$;

    -- User facts ----------------------------------------------------------
    EXECUTE $ddl$
        CREATE TABLE IF NOT EXISTS public.user_facts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            fact TEXT NOT NULL,
            category TEXT,
            confidence DOUBLE PRECISION CHECK (confidence >= 0 AND confidence <= 1) DEFAULT 0.8,
            source_entry_ids UUID[] DEFAULT ARRAY[]::UUID[],
            last_confirmed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    $ddl$;

    EXECUTE $ddl$
        CREATE INDEX IF NOT EXISTS idx_user_facts_user
            ON public.user_facts(user_id, created_at DESC)
    $ddl$;

    EXECUTE $ddl$
        CREATE INDEX IF NOT EXISTS idx_user_facts_category
            ON public.user_facts(category)
    $ddl$;

    EXECUTE $ddl$
        DROP TRIGGER IF EXISTS user_facts_set_updated_at ON public.user_facts
    $ddl$;

    EXECUTE $ddl$
        CREATE TRIGGER user_facts_set_updated_at
            BEFORE UPDATE ON public.user_facts
            FOR EACH ROW
            EXECUTE FUNCTION public.set_updated_at()
    $ddl$;

    EXECUTE $ddl$
        ALTER TABLE public.user_facts ENABLE ROW LEVEL SECURITY
    $ddl$;

    EXECUTE $ddl$
        DROP POLICY IF EXISTS user_facts_select_own ON public.user_facts
    $ddl$;

    EXECUTE $ddl$
        CREATE POLICY user_facts_select_own ON public.user_facts
            FOR SELECT USING (auth.uid() = user_id)
    $ddl$;

    EXECUTE $ddl$
        DROP POLICY IF EXISTS user_facts_insert_own ON public.user_facts
    $ddl$;

    EXECUTE $ddl$
        CREATE POLICY user_facts_insert_own ON public.user_facts
            FOR INSERT WITH CHECK (auth.uid() = user_id)
    $ddl$;

    EXECUTE $ddl$
        DROP POLICY IF EXISTS user_facts_update_own ON public.user_facts
    $ddl$;

    EXECUTE $ddl$
        CREATE POLICY user_facts_update_own ON public.user_facts
            FOR UPDATE USING (auth.uid() = user_id)
    $ddl$;

    EXECUTE $ddl$
        DROP POLICY IF EXISTS user_facts_delete_own ON public.user_facts
    $ddl$;

    EXECUTE $ddl$
        CREATE POLICY user_facts_delete_own ON public.user_facts
            FOR DELETE USING (auth.uid() = user_id)
    $ddl$;

    -- Goals ----------------------------------------------------------------
    EXECUTE $ddl$
        CREATE TABLE IF NOT EXISTS public.goals (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            description TEXT,
            category TEXT,
            target_date DATE,
            status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'archived', 'paused')) DEFAULT 'active',
            current_step TEXT,
            micro_steps JSONB DEFAULT '[]'::JSONB,
            source_entry_id UUID REFERENCES public.entries(id) ON DELETE SET NULL,
            metadata JSONB DEFAULT '{}'::JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    $ddl$;

    EXECUTE $ddl$
        CREATE INDEX IF NOT EXISTS idx_goals_user
            ON public.goals(user_id, status, created_at DESC)
    $ddl$;

    EXECUTE $ddl$
        CREATE INDEX IF NOT EXISTS idx_goals_status
            ON public.goals(status)
    $ddl$;

    EXECUTE $ddl$
        CREATE INDEX IF NOT EXISTS idx_goals_source_entry
            ON public.goals(source_entry_id)
    $ddl$;

    EXECUTE $ddl$
        DROP TRIGGER IF EXISTS goals_set_updated_at ON public.goals
    $ddl$;

    EXECUTE $ddl$
        CREATE TRIGGER goals_set_updated_at
            BEFORE UPDATE ON public.goals
            FOR EACH ROW
            EXECUTE FUNCTION public.set_updated_at()
    $ddl$;

    EXECUTE $ddl$
        ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY
    $ddl$;

    EXECUTE $ddl$
        DROP POLICY IF EXISTS goals_select_own ON public.goals
    $ddl$;

    EXECUTE $ddl$
        CREATE POLICY goals_select_own ON public.goals
            FOR SELECT USING (auth.uid() = user_id)
    $ddl$;

    EXECUTE $ddl$
        DROP POLICY IF EXISTS goals_insert_own ON public.goals
    $ddl$;

    EXECUTE $ddl$
        CREATE POLICY goals_insert_own ON public.goals
            FOR INSERT WITH CHECK (auth.uid() = user_id)
    $ddl$;

    EXECUTE $ddl$
        DROP POLICY IF EXISTS goals_update_own ON public.goals
    $ddl$;

    EXECUTE $ddl$
        CREATE POLICY goals_update_own ON public.goals
            FOR UPDATE USING (auth.uid() = user_id)
    $ddl$;

    EXECUTE $ddl$
        DROP POLICY IF EXISTS goals_delete_own ON public.goals
    $ddl$;

    EXECUTE $ddl$
        CREATE POLICY goals_delete_own ON public.goals
            FOR DELETE USING (auth.uid() = user_id)
    $ddl$;

    -- Check-ins ------------------------------------------------------------
    EXECUTE $ddl$
        CREATE TABLE IF NOT EXISTS public.check_ins (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            type TEXT NOT NULL CHECK (type IN ('daily_morning', 'daily_evening', 'weekly')),
            prompt TEXT NOT NULL,
            response TEXT,
            response_entry_id UUID REFERENCES public.entries(id) ON DELETE SET NULL,
            scheduled_for TIMESTAMPTZ NOT NULL,
            completed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    $ddl$;

    EXECUTE $ddl$
        CREATE INDEX IF NOT EXISTS idx_check_ins_user
            ON public.check_ins(user_id, scheduled_for DESC)
    $ddl$;

    EXECUTE $ddl$
        CREATE INDEX IF NOT EXISTS idx_check_ins_type
            ON public.check_ins(type)
    $ddl$;

    EXECUTE $ddl$
        CREATE INDEX IF NOT EXISTS idx_check_ins_scheduled
            ON public.check_ins(scheduled_for) WHERE completed_at IS NULL
    $ddl$;

    EXECUTE $ddl$
        ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY
    $ddl$;

    EXECUTE $ddl$
        DROP POLICY IF EXISTS check_ins_select_own ON public.check_ins
    $ddl$;

    EXECUTE $ddl$
        CREATE POLICY check_ins_select_own ON public.check_ins
            FOR SELECT USING (auth.uid() = user_id)
    $ddl$;

    EXECUTE $ddl$
        DROP POLICY IF EXISTS check_ins_insert_own ON public.check_ins
    $ddl$;

    EXECUTE $ddl$
        CREATE POLICY check_ins_insert_own ON public.check_ins
            FOR INSERT WITH CHECK (auth.uid() = user_id)
    $ddl$;

    EXECUTE $ddl$
        DROP POLICY IF EXISTS check_ins_update_own ON public.check_ins
    $ddl$;

    EXECUTE $ddl$
        CREATE POLICY check_ins_update_own ON public.check_ins
            FOR UPDATE USING (auth.uid() = user_id)
    $ddl$;

    EXECUTE $ddl$
        DROP POLICY IF EXISTS check_ins_delete_own ON public.check_ins
    $ddl$;

    EXECUTE $ddl$
        CREATE POLICY check_ins_delete_own ON public.check_ins
            FOR DELETE USING (auth.uid() = user_id)
    $ddl$;

    -- Helper function -----------------------------------------------------
    EXECUTE $ddl$
        CREATE OR REPLACE FUNCTION public.match_entry_embeddings(
            query_embedding vector(1536),
            match_user_id UUID,
            match_threshold FLOAT DEFAULT 0.7,
            match_count INT DEFAULT 5
        )
        RETURNS TABLE (
            entry_id UUID,
            similarity FLOAT
        )
        LANGUAGE SQL STABLE
        AS $func$
            SELECT
                entry_id,
                1 - (embedding <=> query_embedding) AS similarity
            FROM public.entry_embeddings
            WHERE user_id = match_user_id
                AND 1 - (embedding <=> query_embedding) > match_threshold
            ORDER BY embedding <=> query_embedding
            LIMIT match_count;
        $func$
    $ddl$;
END
$do$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entry_summaries TO authenticated, service_role;
GRANT SELECT ON public.entry_summaries TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entry_embeddings TO authenticated, service_role;
GRANT SELECT ON public.entry_embeddings TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_facts TO authenticated, service_role;
GRANT SELECT ON public.user_facts TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals TO authenticated, service_role;
GRANT SELECT ON public.goals TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.check_ins TO authenticated, service_role;
GRANT SELECT ON public.check_ins TO anon;

GRANT EXECUTE ON FUNCTION public.match_entry_embeddings(vector(1536), uuid, float, integer)
    TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
