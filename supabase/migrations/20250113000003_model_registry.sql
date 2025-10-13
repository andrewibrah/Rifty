-- Model registry to track intent classifier promotions
CREATE TABLE IF NOT EXISTS public.model_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name TEXT NOT NULL,
    version TEXT NOT NULL,
    description TEXT,
    artifact_path TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT model_registry_unique UNIQUE (model_name, version)
);

CREATE TABLE IF NOT EXISTS public.model_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID NOT NULL REFERENCES public.model_registry(id) ON DELETE CASCADE,
    accuracy NUMERIC(5,4) NOT NULL,
    top3_accuracy NUMERIC(5,4) NOT NULL,
    confusion JSONB NOT NULL,
    report_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.model_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS model_registry_read ON public.model_registry;
CREATE POLICY model_registry_read ON public.model_registry
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS model_registry_insert ON public.model_registry;
CREATE POLICY model_registry_insert ON public.model_registry
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS model_evaluations_read ON public.model_evaluations;
CREATE POLICY model_evaluations_read ON public.model_evaluations
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS model_evaluations_insert ON public.model_evaluations;
CREATE POLICY model_evaluations_insert ON public.model_evaluations
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_model_registry_name ON public.model_registry(model_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_model_evaluations_model ON public.model_evaluations(model_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
