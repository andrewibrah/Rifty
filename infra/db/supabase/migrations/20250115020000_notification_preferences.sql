-- Notification preferences: check-ins and missed day alerts
ALTER TABLE public.user_settings
    ADD COLUMN IF NOT EXISTS checkin_notifications BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS missed_day_notifications BOOLEAN NOT NULL DEFAULT TRUE;

NOTIFY pgrst, 'reload schema';
