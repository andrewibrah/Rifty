-- Chat sessions table and profile stats enhancements

-- Create chat_sessions table
CREATE TABLE IF NOT EXISTS public.chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_date DATE NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    title TEXT,
    summary TEXT,
    message_count INTEGER NOT NULL DEFAULT 0,
    ai_title_confidence DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_date
    ON public.chat_sessions (user_id, session_date DESC);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_started_at
    ON public.chat_sessions (started_at DESC);

-- Trigger to maintain updated_at
DROP TRIGGER IF EXISTS chat_sessions_set_updated_at ON public.chat_sessions;
CREATE TRIGGER chat_sessions_set_updated_at
    BEFORE UPDATE ON public.chat_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS and policies
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_sessions_select_own ON public.chat_sessions;
CREATE POLICY chat_sessions_select_own ON public.chat_sessions
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS chat_sessions_insert_own ON public.chat_sessions;
CREATE POLICY chat_sessions_insert_own ON public.chat_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS chat_sessions_update_own ON public.chat_sessions;
CREATE POLICY chat_sessions_update_own ON public.chat_sessions
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS chat_sessions_delete_own ON public.chat_sessions;
CREATE POLICY chat_sessions_delete_own ON public.chat_sessions
    FOR DELETE USING (auth.uid() = user_id);

-- Extend profiles table with streak + missed-day metrics
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS missed_day_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS current_streak INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_streak
    ON public.profiles (current_streak DESC, missed_day_count ASC);

NOTIFY pgrst, 'reload schema';
