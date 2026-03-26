-- 给 ledgers 表添加 description 列，用于存储账单分类明细（JSON 数组格式）
-- 在 Supabase SQL Editor 中执行此文件

ALTER TABLE ledgers
  ADD COLUMN IF NOT EXISTS description text;

-- 验证列已添加
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'ledgers'
  AND column_name = 'description';
