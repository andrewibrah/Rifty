-- Tracks manual review of intent predictions from on-device classifier
CREATE TABLE IF NOT EXISTS public.intent_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entry_id UUID NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    predicted_intent TEXT NOT NULL,
    correct_intent TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.intent_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intent_audits_select_own ON public.intent_audits;
CREATE POLICY intent_audits_select_own ON public.intent_audits
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS intent_audits_insert_own ON public.intent_audits;
CREATE POLICY intent_audits_insert_own ON public.intent_audits
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_intent_audits_user ON public.intent_audits(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intent_audits_entry ON public.intent_audits(entry_id);

NOTIFY pgrst, 'reload schema';
