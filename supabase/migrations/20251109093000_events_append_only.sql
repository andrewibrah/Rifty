-- Enforce append-only behavior for events audit log
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.enforce_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'events rows are immutable';
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'events rows cannot be deleted';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_prevent_update ON public.events;
CREATE TRIGGER events_prevent_update
BEFORE UPDATE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.enforce_events_append_only();

DROP TRIGGER IF EXISTS events_prevent_delete ON public.events;
CREATE TRIGGER events_prevent_delete
BEFORE DELETE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.enforce_events_append_only();
