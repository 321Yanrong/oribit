-- ============================================================
-- 修复 ledger_participants 与 ledgers 之间的无限递归 RLS 策略
-- 错误: 42P17 infinite recursion detected
--
-- 根本原因: ledger_participants 的策略子查询 ledgers,
--           而 ledgers 带 JOIN participants 时又触发 ledger_participants 的 RLS
--
-- 解决方案: 使用 SECURITY DEFINER 函数绕过 RLS 检查,
--           打破两张表之间的递归依赖链
-- ============================================================

-- ========== 第一步: 创建辅助函数 (SECURITY DEFINER 绕过 RLS) ==========

-- 函数1: 获取当前用户创建的所有 ledger ID (不受 RLS 限制)
CREATE OR REPLACE FUNCTION get_my_ledger_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM ledgers WHERE creator_id = auth.uid();
$$;

-- 函数2: 获取当前用户参与的所有 ledger ID (不受 RLS 限制)
CREATE OR REPLACE FUNCTION get_my_participated_ledger_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ledger_id FROM ledger_participants WHERE user_id = auth.uid();
$$;

-- ========== 第二步: 清除 ledgers 表上所有旧策略 ==========

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'ledgers' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON ledgers', pol.policyname);
  END LOOP;
END $$;

-- ========== 第三步: 清除 ledger_participants 表上所有旧策略 ==========

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'ledger_participants' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON ledger_participants', pol.policyname);
  END LOOP;
END $$;

-- ========== 第四步: 确保 RLS 已启用 ==========

ALTER TABLE ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_participants ENABLE ROW LEVEL SECURITY;

-- ========== 第五步: 重建 ledgers 策略 (简单, 只查自身字段) ==========

-- SELECT: 创建者可以看到自己的账单
CREATE POLICY "ledgers_select" ON ledgers
  FOR SELECT USING (creator_id = auth.uid());

-- INSERT: 创建者可以创建账单
CREATE POLICY "ledgers_insert" ON ledgers
  FOR INSERT WITH CHECK (creator_id = auth.uid());

-- UPDATE: 创建者可以更新自己的账单
CREATE POLICY "ledgers_update" ON ledgers
  FOR UPDATE USING (creator_id = auth.uid());

-- DELETE: 创建者可以删除自己的账单
CREATE POLICY "ledgers_delete" ON ledgers
  FOR DELETE USING (creator_id = auth.uid());

-- ========== 第六步: 重建 ledger_participants 策略 (用函数打破递归) ==========

-- SELECT: 自己参与的 OR 自己创建的账单的参与者
CREATE POLICY "lp_select" ON ledger_participants
  FOR SELECT USING (
    user_id = auth.uid()
    OR
    ledger_id IN (SELECT get_my_ledger_ids())
  );

-- INSERT: 只有账单创建者可以插入参与者
CREATE POLICY "lp_insert" ON ledger_participants
  FOR INSERT WITH CHECK (
    ledger_id IN (SELECT get_my_ledger_ids())
  );

-- UPDATE: 只有账单创建者可以更新参与者
CREATE POLICY "lp_update" ON ledger_participants
  FOR UPDATE USING (
    ledger_id IN (SELECT get_my_ledger_ids())
  );

-- DELETE: 只有账单创建者可以删除参与者
CREATE POLICY "lp_delete" ON ledger_participants
  FOR DELETE USING (
    ledger_id IN (SELECT get_my_ledger_ids())
  );

-- ========== 完成! ==========
-- 现在 ledgers 的策略只查 creator_id (不触发 ledger_participants 的 RLS)
-- ledger_participants 的策略通过 SECURITY DEFINER 函数查 ledgers (绕过 ledgers 的 RLS)
-- 递归链被彻底打断
