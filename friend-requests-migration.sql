-- ==============================================
-- 好友申请流程 Migration
-- 运行说明：在 Supabase SQL Editor 中执行此文件
-- ==============================================

-- 1. 为 friendships 表的 UPDATE 策略允许接收方也能操作
--    （接受申请时需要把 pending → accepted）
DROP POLICY IF EXISTS "Users can update own friendships" ON friendships;

CREATE POLICY "Users can update own or received friendships" ON friendships
  FOR UPDATE USING (
    auth.uid() = user_id          -- 发起方可更新（改备注等）
    OR auth.uid() = friend_id     -- 接收方可更新（接受申请）
  );

-- 2. 允许接收方删除（拒绝申请）
DROP POLICY IF EXISTS "Users can delete own friendships" ON friendships;

CREATE POLICY "Users can delete own or received friendships" ON friendships
  FOR DELETE USING (
    auth.uid() = user_id          -- 发起方可删除（撤回申请 / 删好友）
    OR auth.uid() = friend_id     -- 接收方可删除（拒绝申请）
  );

-- 3. 允许绑定虚拟好友时为对方插入反向记录
--    （A 绑定 B 时，需要插入 user_id=B 的行，但 A 是登录方）
DROP POLICY IF EXISTS "Users can insert own friendships" ON friendships;

CREATE POLICY "Users can insert friendships" ON friendships
  FOR INSERT WITH CHECK (
    auth.uid() = user_id          -- 正常：自己作为发起方
    OR auth.uid() = friend_id     -- 绑定时：A 帮 B 创建反向记录（auth.uid=A, friend_id=A）
  );

-- 4. profiles 表需要支持 friend_id 反查（getPendingFriendRequests 用到 JOIN）
--    如果 profiles 已有 public SELECT 策略则跳过
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles'
      AND policyname = 'Public profiles are viewable by everyone'
  ) THEN
    CREATE POLICY "Public profiles are viewable by everyone" ON profiles
      FOR SELECT USING (true);
  END IF;
END $$;

-- 5. 去重 + 唯一约束：同一 user_id → friend_id 只保留一条记录
WITH ranked_friendships AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, friend_id ORDER BY created_at) AS rn
  FROM friendships
  WHERE friend_id IS NOT NULL
)
DELETE FROM friendships
WHERE id IN (
  SELECT id FROM ranked_friendships WHERE rn > 1
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'friendships_user_friend_unique'
      AND table_name = 'friendships'
  ) THEN
    ALTER TABLE friendships
      ADD CONSTRAINT friendships_user_friend_unique UNIQUE (user_id, friend_id);
  END IF;
END $$;
