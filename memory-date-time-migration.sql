-- 将 memories.memory_date 从 DATE 升级为 TIMESTAMPTZ，以保留具体时间
-- 注意：历史数据的时间无法恢复，将默认变为当天 00:00（UTC）
ALTER TABLE memories
  ALTER COLUMN memory_date TYPE TIMESTAMPTZ
  USING memory_date::timestamptz;
