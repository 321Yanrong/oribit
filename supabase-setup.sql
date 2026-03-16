-- =============================================
-- ORIBIT App Database Schema
-- Run this in Supabase SQL Editor
-- =============================================

-- =============================================
-- Cleanup: drop existing objects (this will REMOVE DATA)
-- Run with caution in production
-- =============================================
DROP TABLE IF EXISTS ledger_participants CASCADE;
DROP TABLE IF EXISTS ledgers CASCADE;
DROP TABLE IF EXISTS settlements CASCADE;
DROP TABLE IF EXISTS memory_comments CASCADE;
DROP TABLE IF EXISTS memory_tags CASCADE;
DROP TABLE IF EXISTS memories CASCADE;
DROP TABLE IF EXISTS locations CASCADE;
DROP TABLE IF EXISTS friendships CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Functions/triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.sync_memory_tag_owner() CASCADE;
DROP FUNCTION IF EXISTS public.delete_my_account() CASCADE;

-- Storage policies (table is managed by Supabase)
DROP POLICY IF EXISTS "Avatar upload policy" ON storage.objects;
DROP POLICY IF EXISTS "Avatar update policy" ON storage.objects;
DROP POLICY IF EXISTS "Photo upload policy" ON storage.objects;
DROP POLICY IF EXISTS "Photo update policy" ON storage.objects;
DROP POLICY IF EXISTS "Video upload policy" ON storage.objects;

-- NOTE: auth.users is managed by Supabase; do not modify RLS here.

-- =============================================
-- 1. PROFILES TABLE (extends auth.users)
-- =============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT,
  avatar_url TEXT,
  invite_code TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'username');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill profiles for any existing auth.users (idempotent)
INSERT INTO public.profiles (id, username, avatar_url)
SELECT u.id,
       u.raw_user_meta_data->>'username',
       u.raw_user_meta_data->>'avatar_url'
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Profile policies
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);
-- Allow any authenticated user to look up a profile by invite_code
CREATE POLICY "Users can lookup profile by invite code" ON profiles
  FOR SELECT USING (invite_code IS NOT NULL);
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- =============================================
-- 2. FRIENDSHIPS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  friend_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- nullable for virtual friends
  friend_name TEXT, -- name for virtual/offline friends
  remark TEXT, -- user-defined nickname/note
  status TEXT DEFAULT 'accepted',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own friendships" ON friendships
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);
CREATE POLICY "Users can create friendships" ON friendships
  FOR INSERT WITH CHECK (
    auth.uid() = user_id OR auth.uid() = friend_id
  );
DROP POLICY IF EXISTS "Users can update own friendships" ON friendships;
DROP POLICY IF EXISTS "Users can update own or received friendships" ON friendships;
CREATE POLICY "Users can update own or received friendships" ON friendships
  FOR UPDATE USING (
    auth.uid() = user_id
    OR auth.uid() = friend_id
  )
  WITH CHECK (
    auth.uid() = user_id
    OR auth.uid() = friend_id
    OR friend_id IS NULL
  );

DROP POLICY IF EXISTS "Users can delete own friendships" ON friendships;
DROP POLICY IF EXISTS "Users can delete own or received friendships" ON friendships;
CREATE POLICY "Users can delete own or received friendships" ON friendships
  FOR DELETE USING (
    auth.uid() = user_id
    OR auth.uid() = friend_id
  );

DROP POLICY IF EXISTS "Users can view own or received friendships" ON friendships;
CREATE POLICY "Users can view own or received friendships" ON friendships
  FOR SELECT USING (
    auth.uid() = user_id
    OR auth.uid() = friend_id
  );

DROP POLICY IF EXISTS "Users can insert own friendships" ON friendships;
DROP POLICY IF EXISTS "Users can insert friendships" ON friendships;
CREATE POLICY "Users can insert friendships" ON friendships
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    OR auth.uid() = friend_id
  );

-- =============================================
-- 3. LOCATIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  lat FLOAT NOT NULL,
  lng FLOAT NOT NULL,
  address TEXT,
  category TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view locations" ON locations
  FOR SELECT USING (true);
CREATE POLICY "Users can create locations" ON locations
  FOR INSERT WITH CHECK (auth.uid() = created_by);

-- =============================================
-- 4. MEMORIES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT,
  memory_date TIMESTAMPTZ,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  photos TEXT[] DEFAULT '{}',
  videos TEXT[] DEFAULT '{}',
  audios TEXT[] DEFAULT '{}',
  has_ledger BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

-- Temporary owner-only policies (replace after memory_tags exists)
DROP POLICY IF EXISTS "Users can view own memories" ON memories;
CREATE POLICY "Users can view own memories" ON memories
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create memories" ON memories
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own memories" ON memories
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own memories" ON memories
  FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- 5. MEMORY_TAGS TABLE (tag friends in memories)
-- =============================================
CREATE TABLE IF NOT EXISTS memory_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID REFERENCES memories(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  virtual_friend_id UUID REFERENCES friendships(id) ON DELETE SET NULL,
  owner_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE memory_tags ENABLE ROW LEVEL SECURITY;

-- 同步 memory_tags.owner_id = memory.creator
UPDATE memory_tags mt
SET owner_id = m.user_id
FROM memories m
WHERE mt.owner_id IS NULL AND mt.memory_id = m.id;

CREATE OR REPLACE FUNCTION public.sync_memory_tag_owner()
RETURNS TRIGGER AS $$
DECLARE
  creator UUID;
BEGIN
  SELECT user_id INTO creator FROM memories WHERE id = NEW.memory_id;
  IF creator IS NULL THEN
    RAISE EXCEPTION 'memory_id % not found when syncing tag owner', NEW.memory_id;
  END IF;
  NEW.owner_id := creator;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS sync_memory_tag_owner ON memory_tags;
CREATE TRIGGER sync_memory_tag_owner
  BEFORE INSERT OR UPDATE OF memory_id ON memory_tags
  FOR EACH ROW EXECUTE FUNCTION public.sync_memory_tag_owner();

-- 帮助函数：绕过 RLS 检查当前用户是否被标记在同一条记忆中
CREATE OR REPLACE FUNCTION public.is_user_tagged_in_memory(
  p_memory_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM memory_tags mt
    WHERE mt.memory_id = p_memory_id
      AND mt.user_id = p_user_id
  );
$$;

-- Tagged user sees own tags; memory creator sees all tags on their memories
DROP POLICY IF EXISTS "Users can view memory tags" ON memory_tags;
CREATE POLICY "Users can view memory tags" ON memory_tags
  FOR SELECT USING (
    auth.uid() = owner_id
    OR auth.uid() = user_id
    OR (
      public.is_user_tagged_in_memory(memory_tags.memory_id, auth.uid())
      AND EXISTS (
        SELECT 1 FROM friendships f
        WHERE f.user_id = auth.uid()
          AND f.friend_id = memory_tags.user_id
          AND f.status = 'accepted'
      )
    )
  );

DROP POLICY IF EXISTS "Memory owners insert tags" ON memory_tags;
CREATE POLICY "Memory owners insert tags" ON memory_tags
  FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Memory owners update tags" ON memory_tags;
CREATE POLICY "Memory owners update tags" ON memory_tags
  FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Memory owners delete tags" ON memory_tags;
CREATE POLICY "Memory owners delete tags" ON memory_tags
  FOR DELETE USING (auth.uid() = owner_id);

-- After memory_tags exists, widen memory visibility to tagged users too
DROP POLICY IF EXISTS "Users can view own memories" ON memories;
CREATE POLICY "Users can view own or tagged memories" ON memories
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM memory_tags
      WHERE memory_tags.memory_id = memories.id
        AND memory_tags.user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM friendships f
          WHERE f.user_id = auth.uid()
            AND f.friend_id = memories.user_id
            AND f.status = 'accepted'
        )
    )
  );

-- =============================================
-- 6. MEMORY_COMMENTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS memory_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID REFERENCES memories(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE memory_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view memory comments" ON memory_comments;
CREATE POLICY "Users can view memory comments" ON memory_comments
  FOR SELECT USING (
    auth.uid() = author_id
    OR EXISTS (
      SELECT 1
      FROM memories m
      WHERE m.id = memory_comments.memory_id
        AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM memories m
      WHERE m.id = memory_comments.memory_id
        AND EXISTS (
          SELECT 1 FROM memory_tags mt
          WHERE mt.memory_id = m.id
            AND mt.user_id = auth.uid()
        )
        AND EXISTS (
          SELECT 1 FROM friendships f
          WHERE f.user_id = auth.uid()
            AND f.friend_id = m.user_id
            AND f.status = 'accepted'
        )
    )
  );

DROP POLICY IF EXISTS "Visible users can create memory comments" ON memory_comments;
CREATE POLICY "Visible users can create memory comments" ON memory_comments
  FOR INSERT WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1
      FROM memories m
      WHERE m.id = memory_comments.memory_id
        AND (
          m.user_id = auth.uid()
          OR (
            EXISTS (
              SELECT 1 FROM memory_tags mt
              WHERE mt.memory_id = m.id
                AND mt.user_id = auth.uid()
            )
            AND EXISTS (
              SELECT 1 FROM friendships f
              WHERE f.user_id = auth.uid()
                AND f.friend_id = m.user_id
                AND f.status = 'accepted'
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS "Authors can update own memory comments" ON memory_comments;
CREATE POLICY "Authors can update own memory comments" ON memory_comments
  FOR UPDATE USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Authors or owners can delete memory comments" ON memory_comments;
CREATE POLICY "Authors or owners can delete memory comments" ON memory_comments
  FOR DELETE USING (
    auth.uid() = author_id
    OR EXISTS (
      SELECT 1 FROM memories m
      WHERE m.id = memory_comments.memory_id
        AND m.user_id = auth.uid()
    )
  );

-- =============================================
-- 7. LEDGERS TABLE (expense tracking)
-- =============================================
CREATE TABLE IF NOT EXISTS ledgers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  total_amount FLOAT NOT NULL,
  currency TEXT DEFAULT 'HKD',
  memory_id UUID REFERENCES memories(id) ON DELETE SET NULL,
  expense_type TEXT DEFAULT 'shared',
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ledgers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ledgers" ON ledgers
  FOR SELECT USING (auth.uid() = creator_id);
CREATE POLICY "Users can create ledgers" ON ledgers
  FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Users can update own ledgers" ON ledgers
  FOR UPDATE USING (auth.uid() = creator_id);
CREATE POLICY "Users can delete own ledgers" ON ledgers
  FOR DELETE USING (auth.uid() = creator_id);

-- =============================================
-- 8. LEDGER_PARTICIPANTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS ledger_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID REFERENCES ledgers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount FLOAT NOT NULL,
  paid BOOLEAN DEFAULT FALSE,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ledger_participants ENABLE ROW LEVEL SECURITY;

-- Participant can see their own rows; creator can see all rows on their ledger
CREATE POLICY "Users can view ledger participants" ON ledger_participants
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM ledgers WHERE ledgers.id = ledger_id AND ledgers.creator_id = auth.uid())
  );
-- Creator inserts participants for all users (including others)
DROP POLICY IF EXISTS "Users can create ledger participants" ON ledger_participants;
CREATE POLICY "Ledger creator can insert participants" ON ledger_participants
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM ledgers WHERE ledgers.id = ledger_id AND ledgers.creator_id = auth.uid())
  );
-- Creator can delete participants when editing/updating a ledger
CREATE POLICY "Ledger creator can delete participants" ON ledger_participants
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM ledgers WHERE ledgers.id = ledger_id AND ledgers.creator_id = auth.uid())
  );

-- =============================================
-- 9. SETTLEMENTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount FLOAT NOT NULL,
  status TEXT DEFAULT 'pending',
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settlements" ON settlements
  FOR SELECT USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

-- =============================================
-- 9. STORAGE BUCKETS
-- =============================================
INSERT INTO storage.buckets (id, name, public) VALUES 
  ('photos', 'photos', true),
  ('avatars', 'avatars', true),
  ('videos', 'videos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies - Allow all uploads for authenticated users
CREATE POLICY "Avatar upload policy" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');

CREATE POLICY "Avatar update policy" ON storage.objects
  FOR UPDATE USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');

CREATE POLICY "Photo upload policy" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'photos' AND auth.role() = 'authenticated');

CREATE POLICY "Photo update policy" ON storage.objects
  FOR UPDATE USING (bucket_id = 'photos' AND auth.role() = 'authenticated');

CREATE POLICY "Video upload policy" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'videos' AND auth.role() = 'authenticated');

-- =============================================
-- 10. ACCOUNT DELETION (self-service)
-- =============================================
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  DELETE FROM auth.users
  WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- =============================================
-- DONE!
-- =============================================
SELECT 'Database setup complete!' as status;
