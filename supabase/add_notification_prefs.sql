-- Add notification preferences and OneSignal player id to profiles
ALTER TABLE IF EXISTS "profiles"
ADD COLUMN IF NOT EXISTS notification_prefs jsonb DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS "profiles"
ADD COLUMN IF NOT EXISTS one_signal_player_id text;

-- Backfill: set default prefs to enable browser notifications for existing profiles
UPDATE "profiles"
SET notification_prefs = jsonb_set(COALESCE(notification_prefs, '{}'::jsonb), '{browser_notifications_enabled}', 'true'::jsonb)
WHERE notification_prefs IS NULL OR notification_prefs = '{}'::jsonb;

-- Index for quick lookup by player id
CREATE INDEX IF NOT EXISTS idx_profiles_one_signal_player_id ON "profiles" (one_signal_player_id);
