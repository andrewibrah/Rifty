-- Entry enrichment: mood, feelings, linked moments
ALTER TABLE public.entries
    ADD COLUMN IF NOT EXISTS mood TEXT,
    ADD COLUMN IF NOT EXISTS feeling_tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS linked_moments UUID[] DEFAULT ARRAY[]::UUID[];

CREATE INDEX IF NOT EXISTS idx_entries_mood ON public.entries (mood);
CREATE INDEX IF NOT EXISTS idx_entries_feeling_tags ON public.entries USING GIN (feeling_tags);

-- Wrap DDL in a DO block so Supabase CLI parses a single statement per EXECUTE
DO $do$
BEGIN
    EXECUTE $ddl$
        CREATE TABLE IF NOT EXISTS public.atomic_moments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            entry_id UUID REFERENCES public.entries(id) ON DELETE SET NULL,
            message_id UUID,
            session_id UUID REFERENCES public.chat_sessions(id) ON DELETE SET NULL,
            content TEXT NOT NULL,
            tags TEXT[] DEFAULT ARRAY[]::TEXT[],
            importance_score INTEGER CHECK (importance_score >= 1 AND importance_score <= 10) DEFAULT 5,
            metadata JSONB DEFAULT '{}'::JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    $ddl$;

    EXECUTE $ddl$
        CREATE INDEX IF NOT EXISTS idx_atomic_moments_user
            ON public.atomic_moments (user_id, created_at DESC)
    $ddl$;

    EXECUTE $ddl$
        CREATE INDEX IF NOT EXISTS idx_atomic_moments_importance
            ON public.atomic_moments (importance_score DESC)
    $ddl$;

    EXECUTE $ddl$
        CREATE INDEX IF NOT EXISTS idx_atomic_moments_tags
            ON public.atomic_moments USING GIN (tags)
    $ddl$;

    EXECUTE $ddl$
        CREATE INDEX IF NOT EXISTS idx_atomic_moments_entry
            ON public.atomic_moments (entry_id)
    $ddl$;

    EXECUTE $ddl$
        DROP TRIGGER IF EXISTS atomic_moments_set_updated_at ON public.atomic_moments
    $ddl$;

    EXECUTE $ddl$
        CREATE TRIGGER atomic_moments_set_updated_at
            BEFORE UPDATE ON public.atomic_moments
            FOR EACH ROW
            EXECUTE FUNCTION public.set_updated_at()
    $ddl$;

    EXECUTE $ddl$
        ALTER TABLE public.atomic_moments ENABLE ROW LEVEL SECURITY
    $ddl$;

    EXECUTE $ddl$
        DROP POLICY IF EXISTS atomic_moments_select_own ON public.atomic_moments
    $ddl$;

    EXECUTE $ddl$
        CREATE POLICY atomic_moments_select_own ON public.atomic_moments
            FOR SELECT USING (auth.uid() = user_id)
    $ddl$;

    EXECUTE $ddl$
        DROP POLICY IF EXISTS atomic_moments_insert_own ON public.atomic_moments
    $ddl$;

    EXECUTE $ddl$
        CREATE POLICY atomic_moments_insert_own ON public.atomic_moments
            FOR INSERT WITH CHECK (auth.uid() = user_id)
    $ddl$;

    EXECUTE $ddl$
        DROP POLICY IF EXISTS atomic_moments_update_own ON public.atomic_moments
    $ddl$;

    EXECUTE $ddl$
        CREATE POLICY atomic_moments_update_own ON public.atomic_moments
            FOR UPDATE USING (auth.uid() = user_id)
    $ddl$;

    EXECUTE $ddl$
        DROP POLICY IF EXISTS atomic_moments_delete_own ON public.atomic_moments
    $ddl$;

    EXECUTE $ddl$
        CREATE POLICY atomic_moments_delete_own ON public.atomic_moments
            FOR DELETE USING (auth.uid() = user_id)
    $ddl$;

    PERFORM pg_notify('pgrst', 'reload schema');
END
$do$;
