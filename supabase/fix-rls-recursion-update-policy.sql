-- Fix 42P17 in UPDATE policy — "Admins can update any profile"
-- Run this in the Supabase SQL Editor.
--
-- The original UPDATE policy queries profiles inside a policy ON profiles,
-- causing infinite recursion when any profile UPDATE is attempted.

-- 1. Helper function to check if the caller is an admin (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_caller_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

-- 2. Drop the broken recursive UPDATE policy
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;

-- 3. Recreate using the non-recursive helper
CREATE POLICY "Admins can update any profile"
  ON profiles
  FOR UPDATE
  USING (
    auth.uid() = id
    OR
    public.is_caller_admin()
  );
