-- 1. 给 profiles 表添加 storage_used 字段
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS storage_used BIGINT DEFAULT 0;

-- 2. 创建触发器函数：自动增减容量
-- 注意：metadata 是 jsonb 类型，我们需要提取 size 属性
CREATE OR REPLACE FUNCTION public.handle_storage_update() 
RETURNS TRIGGER AS $$
BEGIN
  -- 当有新文件上传（INSERT）
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.profiles
    SET storage_used = COALESCE(storage_used, 0) + (NEW.metadata->>'size')::BIGINT
    WHERE id = NEW.owner; -- owner 是 storage.objects 表里的上传者 UUID
    RETURN NEW;
  
  -- 当文件删除（DELETE）
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.profiles
    SET storage_used = GREATEST(0, COALESCE(storage_used, 0) - (OLD.metadata->>'size')::BIGINT)
    WHERE id = OLD.owner;
    RETURN OLD;
  END IF;
  
  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    -- 忽略错误，防止阻断正常文件操作
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. 绑定触发器到 storage.objects 表
DROP TRIGGER IF EXISTS on_file_upload ON storage.objects;

CREATE TRIGGER on_file_upload
AFTER INSERT OR DELETE ON storage.objects
FOR EACH ROW
EXECUTE FUNCTION public.handle_storage_update();

-- 4. 【重要】初始化现有数据：计算每个用户目前已有的文件总大小，并更新到 profiles 表
-- 这一步确保了“之前上传的文件”也会被计入内存
UPDATE public.profiles
SET storage_used = (
    SELECT COALESCE(SUM((metadata->>'size')::BIGINT), 0)
    FROM storage.objects
    WHERE storage.objects.owner = public.profiles.id
);
