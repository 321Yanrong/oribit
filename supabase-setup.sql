-- =============================================
-- ORIBIT App Database Schema
-- Run this in Supabase SQL Editor
-- =============================================

-- Enable Row Level Security
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 1. PROFILES TABLE (extends auth.users)
-- =============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT,
  avatar_url TEXT,
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

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Profile policies
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- =============================================
-- 2. FRIENDSHIPS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- nullable for virtual friends
  friend_name TEXT, -- name for virtual/offline friends
  status TEXT DEFAULT 'accepted',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own friendships" ON friendships
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);
CREATE POLICY "Users can create friendships" ON friendships
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own friendships" ON friendships
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own friendships" ON friendships
  FOR DELETE USING (auth.uid() = user_id);

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
  memory_date DATE,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  photos TEXT[] DEFAULT '{}',
  videos TEXT[] DEFAULT '{}',
  audios TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE memory_tags ENABLE ROW LEVEL SECURITY;

-- SELECT: tagged user can see their own tags; memory creator can see all tags on their memory
CREATE POLICY "Users can view memory tags" ON memory_tags
  FOR SELECT USING (auth.uid() = user_id);

-- ALL operations for the memory creator (insert/delete/update tags on their own memories)
-- ⚠️ IMPORTANT: Run this DROP + CREATE in Supabase SQL Editor if you hit duplicate-tag bugs
DROP POLICY IF EXISTS "Users can create memory tags" ON memory_tags;
CREATE POLICY "Memory creators can manage tags" ON memory_tags
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM memories WHERE memories.id = memory_tags.memory_id AND memories.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM memories WHERE memories.id = memory_tags.memory_id AND memories.user_id = auth.uid())
  );

-- =============================================
-- 6. LEDGERS TABLE (expense tracking)
-- =============================================
CREATE TABLE IF NOT EXISTS ledgers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  total_amount FLOAT NOT NULL,
  currency TEXT DEFAULT 'HKD',
  memory_id UUID REFERENCES memories(id) ON DELETE SET NULL,
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

-- =============================================
-- 7. LEDGER_PARTICIPANTS TABLE
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

CREATE POLICY "Users can view ledger participants" ON ledger_participants
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create ledger participants" ON ledger_participants
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =============================================
-- 8. SETTLEMENTS TABLE
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
-- DONE!
-- =============================================
SELECT 'Database setup complete!' as status;
