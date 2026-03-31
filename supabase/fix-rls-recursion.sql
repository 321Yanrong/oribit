-- Fix 42P17 — Infinite Recursion in profiles RLS Policy
-- Run this in the Supabase SQL Editor.
--
-- The original policy queried profiles inside a SELECT policy ON profiles,
-- causing infinite recursion. We replace it with a SECURITY DEFINER function
-- that bypasses RLS when checking is_banned, breaking the recursive loop.

-- 1. Helper function — runs as DB owner (bypasses RLS), so no recursion
CREATE OR REPLACE FUNCTION public.is_caller_banned()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_banned FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

-- 2. Drop the broken recursive policy
DROP POLICY IF EXISTS "Banned users blocked from reading others" ON profiles;

-- 3. Recreate using the non-recursive helper
CREATE POLICY "Banned users blocked from reading others"
  ON profiles
  FOR SELECT
  USING (
    auth.uid() = id
    OR
    NOT public.is_caller_banned()
  );
