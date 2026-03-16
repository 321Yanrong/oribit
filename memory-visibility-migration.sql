-- ==============================================
-- 记忆可见性 & 评论隔离迁移
-- 运行说明：在 Supabase SQL Editor 中执行此文件
-- ==============================================

-- 1) memory_tags：允许同一条记忆的共同好友互相看到 @ 列表
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

-- 2) memories：只有仍是好友的被 @ 用户才能继续看到记忆
DROP POLICY IF EXISTS "Users can view own or tagged memories" ON memories;
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

-- 3) memory_comments：评论只对“记忆发布者 + 自己 + 好友”可见
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
        AND (
          memory_comments.author_id = auth.uid()
          OR memory_comments.author_id = m.user_id
          OR EXISTS (
            SELECT 1 FROM friendships f2
            WHERE f2.user_id = auth.uid()
              AND f2.friend_id = memory_comments.author_id
              AND f2.status = 'accepted'
          )
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
