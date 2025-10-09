-- 20250108000000_add_ai_metadata_to_entries.sql
-- Adds AI classification metadata columns for entries created via the chat classifier.

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS ai_intent text,
  ADD COLUMN IF NOT EXISTS ai_confidence double precision,
  ADD COLUMN IF NOT EXISTS ai_meta jsonb,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'user';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'entries'
      AND constraint_name = 'entries_source_check'
  ) THEN
    ALTER TABLE public.entries
      ADD CONSTRAINT entries_source_check
        CHECK (source IN ('user', 'system', 'ai'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'entries'
      AND constraint_name = 'entries_ai_confidence_check'
  ) THEN
    ALTER TABLE public.entries
      ADD CONSTRAINT entries_ai_confidence_check
        CHECK (
          ai_confidence IS NULL
          OR (ai_confidence >= 0 AND ai_confidence <= 1)
        );
  END IF;
END $$;

UPDATE public.entries
SET source = 'user'
WHERE source IS NULL;

NOTIFY pgrst, 'reload schema';
