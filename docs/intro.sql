-- Migration: create core tables (profiles, friendships, memories, memory_tags)
-- Includes indexes, RLS policies, and auth.users -> profiles trigger.
-- Run in Supabase SQL Editor or via psql. Test in staging first.
BEGIN;

-- Ensure helper extension for UUID generation (optional on some setups)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================
-- 1) profiles
-- ============================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  username text,
  email text,
  avatar_url text,
  invite_code text,
  notification_prefs jsonb,
  one_signal_player_id text,
  beta_join_order int,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_invite_code ON public.profiles (invite_code);

-- Enable RLS and policies for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Allow users to SELECT their own profile
CREATE POLICY profiles_self_select ON public.profiles
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND auth.uid() = id);

-- Allow users to UPDATE/DELETE their own profile
CREATE POLICY profiles_self_modify ON public.profiles
  FOR UPDATE, DELETE
  USING (auth.uid() IS NOT NULL AND auth.uid() = id)
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = id);

-- Allow users to INSERT their own profile row (used by trigger or client)
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = id);

-- Optional: create a lightweight public view exposing only non-sensitive public fields
-- (Use with caution; only expose what you intend to be public.)
CREATE OR REPLACE VIEW public.public_profiles AS
  SELECT id, username, avatar_url FROM public.profiles;
GRANT SELECT ON public.public_profiles TO anon; -- allow anonymous reads to this view

-- ============================
-- 2) friendships
-- ============================
CREATE TABLE IF NOT EXISTS public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  friend_id uuid REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'pending', -- pending | accepted | virtual
  friend_name text,
  virtual_meta jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON public.friendships (user_id);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Allow owner to read rows where they are the user OR the friend
CREATE POLICY friendships_select_owner_or_friend ON public.friendships
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND (auth.uid() = user_id OR auth.uid() = friend_id));

-- Allow inserting a friendship where auth.uid() is the requester (user_id)
CREATE POLICY friendships_insert_by_user ON public.friendships
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Allow the requester to update/delete their own outgoing request
CREATE POLICY friendships_modify_by_user ON public.friendships
  FOR UPDATE, DELETE
  USING (auth.uid() IS NOT NULL AND auth.uid() = user_id)
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- ============================
-- 3) memories
-- ============================
CREATE TABLE IF NOT EXISTS public.memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text,
  memory_date date,
  location_id uuid REFERENCES public.locations(id),
  photos text[] DEFAULT '{}'::text[],
  videos text[] DEFAULT '{}'::text[],
  audios text[] DEFAULT '{}'::text[],
  has_ledger boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_memories_user_date ON public.memories (user_id, memory_date DESC);

ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;

-- Owner may SELECT their memories
CREATE POLICY memories_select_owner ON public.memories
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Allow SELECT if the requesting user is tagged on the memory (memory_tags.user_id)
CREATE POLICY memories_select_tagged ON public.memories
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1 FROM public.memory_tags mt
        WHERE mt.memory_id = public.memories.id
          AND (mt.user_id = auth.uid() OR mt.virtual_friend_id IS NOT NULL AND mt.virtual_friend_id::text = auth.uid()::text) -- defensive
      )
    )
  );

-- Allow INSERT only if auth.uid() equals the row's user_id
CREATE POLICY memories_insert_owner ON public.memories
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Allow UPDATE/DELETE only for owner
CREATE POLICY memories_modify_owner ON public.memories
  FOR UPDATE, DELETE
  USING (auth.uid() IS NOT NULL AND auth.uid() = user_id)
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- ============================
-- 4) memory_tags
-- ============================
CREATE TABLE IF NOT EXISTS public.memory_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id uuid NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id), -- real tagged user
  virtual_friend_id uuid REFERENCES public.friendships(id), -- optional virtual friend linkage
  owner_id uuid NOT NULL REFERENCES public.profiles(id), -- who created the tag
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_tags_memory ON public.memory_tags (memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_tags_user ON public.memory_tags (user_id);

ALTER TABLE public.memory_tags ENABLE ROW LEVEL SECURITY;

-- Allow selecting tags if you're owner OR you're the memory owner OR the tagged user
CREATE POLICY memory_tags_select_relevant ON public.memory_tags
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      owner_id = auth.uid()
      OR user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.memories m WHERE m.id = public.memory_tags.memory_id AND m.user_id = auth.uid()
      )
    )
  );

-- Allow inserting tags only when auth.uid() == owner_id
CREATE POLICY memory_tags_insert_owner ON public.memory_tags
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND owner_id = auth.uid());

-- Allow deleting tags by owner or by memory owner
CREATE POLICY memory_tags_delete_owner_or_memory_owner ON public.memory_tags
  FOR DELETE
  USING (
    auth.uid() IS NOT NULL AND (
      owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.memories m WHERE m.id = public.memory_tags.memory_id AND m.user_id = auth.uid()
      )
    )
  );

-- Allow update only by owner (rare)
CREATE POLICY memory_tags_update_owner ON public.memory_tags
  FOR UPDATE
  USING (auth.uid() IS NOT NULL AND owner_id = auth.uid())
  WITH CHECK (auth.uid() IS NOT NULL AND owner_id = auth.uid());

-- ============================
-- 5) Trigger: auto-create profile when auth.users row inserted
-- ============================
-- Function to create a minimal profile row when a new auth user is created.
CREATE OR REPLACE FUNCTION public.handle_auth_user_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Try to extract username from raw_user_meta_data if present, otherwise fallback to email
  INSERT INTO public.profiles (id, username, email, created_at)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->> 'username', ''),
      COALESCE(NEW.email, '')
    ),
    NEW.email,
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Create trigger on auth.users (Supabase-managed auth schema)
DROP TRIGGER IF EXISTS auth_user_insert ON auth.users;
CREATE TRIGGER auth_user_insert
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE PROCEDURE public.handle_auth_user_insert();

-- ============================
-- 6) Helpful Grants for server-side roles (optional)
-- If you have server-side jobs using service_role, they already bypass RLS.
-- For interactive admin queries you may grant SELECT to 'authenticated' role as needed.
-- Example: allow authenticated users to read public_profiles view (already granted to anon above).
-- ============================

COMMIT;

-- ============================
-- Rollback examples (run only when you intend to remove objects)
-- ============================
-- DROP VIEW IF EXISTS public.public_profiles;
-- DROP TRIGGER IF EXISTS auth_user_insert ON auth.users;
-- DROP FUNCTION IF EXISTS public.handle_auth_user_insert();
-- DROP TABLE IF EXISTS public.memory_tags;
-- DROP TABLE IF EXISTS public.memories;
-- DROP TABLE IF EXISTS public.friendships;
-- DROP TABLE IF EXISTS public.profiles;