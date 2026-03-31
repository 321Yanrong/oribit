-- Admin Features Migration
-- Run this in the Supabase SQL Editor.
-- After running, set is_admin = true for your own account:
--   UPDATE profiles SET is_admin = true WHERE id = '<your-user-id>';

-- 1. Add admin/ban/quota columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin            BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_banned           BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS storage_quota_bytes BIGINT  DEFAULT 104857600; -- 100 MB

-- 2. Index for fast admin lookups
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin  ON profiles (is_admin)  WHERE is_admin  = TRUE;
CREATE INDEX IF NOT EXISTS idx_profiles_is_banned ON profiles (is_banned) WHERE is_banned = TRUE;

-- 3. Banned users are blocked from reading any row except their own profile.
--    This means a banned user can still see their own profile (to show a "banned" message)
--    but cannot query friends, memories, etc. where profiles is joined.
--    Drop first in case you re-run the migration.
DROP POLICY IF EXISTS "Banned users blocked from reading others" ON profiles;
CREATE POLICY "Banned users blocked from reading others"
  ON profiles
  FOR SELECT
  USING (
    -- Allow if the row IS the viewer's own profile (so they can see they're banned)
    auth.uid() = id
    OR
    -- Allow if the viewer is NOT banned themselves
    NOT EXISTS (
      SELECT 1 FROM profiles p2
      WHERE p2.id = auth.uid() AND p2.is_banned = TRUE
    )
  );

-- 4. Admins can update any profile (ban, quota, etc.)
--    Regular users may only update their own. The existing policy handles that;
--    we add a separate admin-bypass policy so both can coexist.
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;
CREATE POLICY "Admins can update any profile"
  ON profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p2
      WHERE p2.id = auth.uid() AND p2.is_admin = TRUE
    )
  );
