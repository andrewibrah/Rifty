-- Add custom_goals column to user_settings table
ALTER TABLE public.user_settings
    ADD COLUMN IF NOT EXISTS custom_goals TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
