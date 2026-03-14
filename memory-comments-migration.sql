-- =============================================
-- Orbit memory comments migration
-- Run this in Supabase SQL Editor for existing projects
-- =============================================

CREATE TABLE IF NOT EXISTS public.memory_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID REFERENCES public.memories(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.memory_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view memory comments" ON public.memory_comments;
CREATE POLICY "Users can view memory comments" ON public.memory_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.memories m
      WHERE m.id = memory_comments.memory_id
        AND (
          m.user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.memory_tags mt
            WHERE mt.memory_id = m.id
              AND mt.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "Visible users can create memory comments" ON public.memory_comments;
CREATE POLICY "Visible users can create memory comments" ON public.memory_comments
  FOR INSERT WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1
      FROM public.memories m
      WHERE m.id = memory_comments.memory_id
        AND (
          m.user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.memory_tags mt
            WHERE mt.memory_id = m.id
              AND mt.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "Authors can update own memory comments" ON public.memory_comments;
CREATE POLICY "Authors can update own memory comments" ON public.memory_comments
  FOR UPDATE USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Authors or owners can delete memory comments" ON public.memory_comments;
CREATE POLICY "Authors or owners can delete memory comments" ON public.memory_comments
  FOR DELETE USING (
    auth.uid() = author_id
    OR EXISTS (
      SELECT 1
      FROM public.memories m
      WHERE m.id = memory_comments.memory_id
        AND m.user_id = auth.uid()
    )
  );
