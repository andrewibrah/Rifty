-- Ensure profiles table exists with required columns
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    timezone TEXT DEFAULT 'UTC',
    onboarding_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Personalization settings table
CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    personalization_mode TEXT NOT NULL CHECK (personalization_mode IN ('basic', 'full')) DEFAULT 'full',
    local_cache_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    cadence TEXT NOT NULL CHECK (cadence IN ('none', 'daily', 'weekly')) DEFAULT 'none',
    goals TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    extra_goal TEXT,
    learning_style JSONB NOT NULL DEFAULT jsonb_build_object('visual', 5, 'auditory', 5, 'kinesthetic', 5),
    session_length_minutes INTEGER NOT NULL DEFAULT 25,
    spiritual_prompts BOOLEAN NOT NULL DEFAULT FALSE,
    bluntness INTEGER NOT NULL DEFAULT 5,
    language_intensity TEXT NOT NULL CHECK (language_intensity IN ('soft', 'neutral', 'direct')) DEFAULT 'neutral',
    logging_format TEXT NOT NULL CHECK (logging_format IN ('freeform', 'structured', 'mixed')) DEFAULT 'mixed',
    drift_rule JSONB NOT NULL DEFAULT jsonb_build_object('enabled', FALSE, 'after', NULL),
    crisis_card TEXT,
    persona_tag TEXT NOT NULL DEFAULT 'Generalist',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Persona signals table for audit trail
CREATE TABLE IF NOT EXISTS public.persona_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('onboarding', 'settings_update')),
    rationale TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_persona_signals_user ON public.persona_signals(user_id, created_at DESC);

-- Updated at trigger helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS user_settings_set_updated_at ON public.user_settings;
CREATE TRIGGER user_settings_set_updated_at
    BEFORE UPDATE ON public.user_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persona_signals ENABLE ROW LEVEL SECURITY;

-- Profiles policies (owner only)
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- User settings policies
DROP POLICY IF EXISTS user_settings_select_own ON public.user_settings;
CREATE POLICY user_settings_select_own ON public.user_settings
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_settings_upsert_own ON public.user_settings;
CREATE POLICY user_settings_upsert_own ON public.user_settings
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Persona signals policies
DROP POLICY IF EXISTS persona_signals_select_own ON public.persona_signals;
CREATE POLICY persona_signals_select_own ON public.persona_signals
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS persona_signals_insert_own ON public.persona_signals;
CREATE POLICY persona_signals_insert_own ON public.persona_signals
    FOR INSERT WITH CHECK (auth.uid() = user_id);
