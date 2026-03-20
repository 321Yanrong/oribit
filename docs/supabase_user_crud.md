# Supabase 使用与排查指南（为 Orbit 项目定制）

说明：本文档面向维护人员与开发者，覆盖数据库结构建议、必要的 SQL 迁移片段、前端/服务端 CRUD 使用示例（基于 `src/api/supabase.ts`）、常见错误与排查步骤、以及部署/回滚注意事项。

**位置提示**
- 应查看的现有文件：
  - 项目 Supabase 初始 SQL： [supabase-setup.sql](supabase-setup.sql)
  - 可能存在的迁移脚本示例： [friend-requests-migration.sql](friend-requests-migration.sql)、[memory-tags-migration.sql](memory-tags-migration.sql)（若存在）
  - 前端 Supabase API 封装： `src/api/supabase.ts`（项目中已有）

**目标**
- 明确核心表结构与索引建议
- 补全或建议 RLS（Row Level Security）策略与触发器思路
- 提供可复制的 SQL 迁移片段和回滚语句
- 展示如何在 `src/api/supabase.ts` 使用 CRUD 接口（示例）
- 罗列常见问题与逐步排查方法

---

## 1. 核心表模型（建议）
下面列出 Orbit 常用表的最小化设计（可作为迁移参考）。在执行之前请先备份数据。

- `profiles`（与 Supabase Auth 用户一一对应）
  - id uuid PRIMARY KEY references auth.users(id)
  - username text
  - email text
  - avatar_url text
  - invite_code text
  - notification_prefs jsonb
  - one_signal_player_id text
  - beta_join_order int
  - created_at timestamptz default now()

- `friendships`
  - id uuid primary key
  - user_id uuid references profiles(id)
  - friend_id uuid nullable references profiles(id) -- 若 null 表示虚拟/马甲
  - status text check in ('pending','accepted','virtual')
  - friend_name text nullable -- 用于虚拟关系展示
  - virtual_meta jsonb nullable
  - created_at timestamptz default now()
  - unique constraint on (user_id, friend_id) where friend_id is not null 可以防止重复真实好友

- `memories`
  - id uuid primary key
  - user_id uuid references profiles(id)
  - content text
  - memory_date date
  - location_id uuid references locations(id)
  - photos text[] default '{}' -- 存储公开 url
  - videos text[] default '{}'
  - audios text[] default '{}'
  - has_ledger boolean default false
  - created_at timestamptz default now()
  - updated_at timestamptz

- `memory_tags`
  - id uuid primary key
  - memory_id uuid references memories(id) on delete cascade
  - user_id uuid nullable references profiles(id)
  - virtual_friend_id uuid nullable references friendships(id)
  - owner_id uuid references profiles(id) -- 谁创建了这个 tag

- `memory_comments`
  - id uuid primary key
  - memory_id uuid references memories(id) on delete cascade
  - author_id uuid references profiles(id)
  - content text
  - created_at timestamptz default now()

- `locations`
  - id uuid primary key
  - name text
  - lat double precision
  - lng double precision
  - address text
  - category text
  - created_by uuid references profiles(id)

- `ledgers`, `ledger_participants`, `settlements` 等按现有逻辑建表（见 repo 中 `supabase` 文件夹和 `supabase-setup.sql`）

### 索引建议
- memories(user_id, memory_date DESC) — 常用于查询某用户最近记忆
- memory_tags(memory_id), memory_tags(user_id) — tag 查询加速
- friendships(user_id) — 查询好友列表
- profiles(invite_code) — 根据邀请码查用户

---

## 2. 推荐 SQL 迁移片段（示例）
以下 SQL 仅供参考；在实际执行前请在 staging 环境验证并备份生产数据。

创建 `profiles`（若尚未）示例：

```sql
create table if not exists profiles (
  id uuid primary key,
  username text,
  email text,
  avatar_url text,
  invite_code text,
  notification_prefs jsonb,
  one_signal_player_id text,
  beta_join_order int,
  created_at timestamptz default now()
);
create index if not exists idx_profiles_invite_code on profiles(invite_code);
```

创建 `friendships`：

```sql
create table if not exists friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  friend_id uuid references profiles(id),
  status text not null default 'pending',
  friend_name text,
  created_at timestamptz default now()
);
create index if not exists idx_friendships_user_id on friendships(user_id);
```

记忆与 tag：

```sql
create table if not exists memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  content text,
  memory_date date,
  location_id uuid references locations(id),
  photos text[] default '{}',
  videos text[] default '{}',
  audios text[] default '{}',
  has_ledger boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz
);
create index if not exists idx_memories_user_date on memories(user_id, memory_date desc);

create table if not exists memory_tags (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid references memories(id) on delete cascade,
  user_id uuid references profiles(id),
  virtual_friend_id uuid references friendships(id),
  owner_id uuid references profiles(id)
);
create index if not exists idx_memory_tags_memory on memory_tags(memory_id);
```

回滚示例（务必谨慎）：

```sql
-- 仅在确认无用或在备份后操作
drop table if exists memory_tags;
drop table if exists memories;
```

---

## 3. RLS 与触发器建议
- 强烈建议对 `profiles`、`memories`、`memory_tags`、`friendships` 启用 Row Level Security，并设置合适策略：
  - profiles: 允许用户读写自己的 profile 行；公开读取 username/avatar 的策略需要评估
  - memories: 仅允许 owner 插入/删除/更新自己的 memory；但对读取应允许 owner 和被标记的用户读取
  - memory_tags: 仅允许 owner 或关联用户删除/插入的策略

- 触发器：
  - 当 `auth.users` 新用户创建后，自动在 `profiles` 插入一行（常见做法）
  - 在 `profiles` 删除时，触发级联或调用 Edge Function 做延伸清理（如删除 storage 文件）

示例：创建 profile 的触发器（伪代码）

```sql
create or replace function public.handle_auth_user_insert()
returns trigger as $$
begin
  insert into profiles (id, username, created_at)
  values (new.id, coalesce(new.raw_user_meta_data->>'username',''), now())
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql;

create trigger auth_user_insert
after insert on auth.users
for each row
execute procedure public.handle_auth_user_insert();
```

---

## 4. `src/api/supabase.ts` 中 CRUD 使用示例
项目已经封装了大量方法，下面是调用这些方法的示例片段：

- 获取当前用户 profile

```ts
import { getCurrentUser, getProfile } from './api/supabase'

const user = await getCurrentUser();
const profile = await getProfile(user.id, user.email);
```

- 发帖（创建 memory）

```ts
import { createMemory, uploadMultiplePhotos } from './api/supabase'

// 先上传图片获取 url
const urls = await uploadMultiplePhotos(userId, files);
const memory = await createMemory(userId, '今天去公园', '2026-03-20', locationId, urls, taggedFriends);
```

- 更新记忆内容

```ts
import { updateMemoryContent } from './api/supabase'
await updateMemoryContent(memoryId, '新的文本内容')
```

- 删除记忆

```ts
import { deleteMemory } from './api/supabase'
await deleteMemory(memoryId)
```

- 添加好友（通过邀请码）

```ts
import { addRealFriendByCode } from './api/supabase'
await addRealFriendByCode(currentUserId, inviteCode)
```

- 上传头像并同步 profile

```ts
import { uploadAvatar } from './api/supabase'
const url = await uploadAvatar(userId, file); // 函数内部会更新 profiles.avatar_url
```

---

## 5. 常见错误与排查（逐项）

1) PGRST116 / No rows found
- 描述：当 `.single()` 查询未找到结果时，postgREST 会返回此错误。
- 处理：对 `getProfile` 等函数应对该错误返回 `null` 而不是抛出；检查调用方是否处理 `null`。

2) 22P02 invalid input syntax for type uuid
- 描述：当向 uuid 列传入非 uuid 字符串（例如演示模式使用短 id）会触发。
- 排查：在调用前校验 uuid 格式或过滤掉非 uuid 记录（如 `getMemoryComments` 中所示）。

3) 權限/Row Level Security 拒绝（常见提示中含 `permission`、`violates row level security` 等）
- 描述：当 RLS 策略未配置允许当前操作时抛出。
- 排查步骤：
  - 在 Supabase 控制台 > SQL Editor 执行一个同样的 `select/update`，观察是否被拒绝。
  - 检查 `pg_stat_activity` / audit log 或函数报错信息。
  - 确认表的 RLS 是否启用：`select relrowsecurity from pg_class where relname='memories';`
  - 临时调试：为 admin 用 service_role 密钥在后端运行相同语句，确认数据结构和语句本身无误。

4) 42501 权限错误（permission denied）
- 描述：通常因为函数、触发器或外键操作在当前角色下没有执行权限。
- 排查/解决：以 supabase SQL Editor 中的 `postgres` 用户或管理员角色运行迁移，或在策略中明确授予权限；确保触发器中访问的表对执行触发器的角色可见。

5) 上传/Storage 问题
- 常见：上传超时、`getPublicUrl` 返回 unexpected path、删除文件失败。
- 排查：
  - 在 Supabase 控制台的 Storage > Buckets 检查 bucket 权限（public vs private）。
  - 校验 `upload` 路径是否正确（`fileName` 拼接规则）。
  - 若 `getPublicUrl` 返回 path 包含不同前缀，检查项目 `supabaseUrl` 与前端访问的域名是否一致。

6) Edge Function / RPC 未部署
- 描述：`delete-account` Edge Function 或自定义 RPC 如 `delete_my_account` 未部署会导致账号删除失败。
- 处理：
  - 在 Supabase 控制台 Functions 中确认已部署函数并检查日志。
  - 若未部署，先在本地测试并部署到 Supabase。

7) API 返回 401/403
- 描述：可能是 session 过期或 anon key 权限限制。
- 排查：
  - 使用 `supabase.auth.getUser()` 检查当前 session。
  - 若在浏览器中出现跨域或 token 被拦截，检查 cookie/Storage 与环境。

---

## 6. 调试技巧与操作步骤

- 在 Supabase SQL Editor 里逐条复制 repo 中的迁移 SQL（先在 staging 运行）。
- 使用 psql 或 Supabase CLI 运行 migration：

```bash
# 使用 supabase CLI（若已登陆）
supabase db remote commit --db-url $SUPABASE_DB_URL --file ./supabase/migrations/2026xxxx_create_profiles.sql
```

- 验证 RLS 策略：
  - 以普通用户模拟查询：使用 `auth.signIn` 获取 token，然后在 REST 或 SQL Editor 中以该用户身份执行查询，观察是否返回结果。

- 快速定位问题的 SQL：
  - 若 `memories` 读取空或被拒绝，先运行：

```sql
select * from memories where user_id = 'the-uuid' order by memory_date desc limit 10;
```

- 查看表结构：

```sql
select column_name, data_type from information_schema.columns where table_name = 'memories';
```

---

## 7. 部署与回滚建议

1. 备份：在执行任何生产迁移前导出数据（至少导出受影响表的 CSV 或使用 pg_dump）。
2. 在 staging 环境运行迁移并跑一遍 E2E（常见用户操作路径）。
3. 部署迁移到 prod：使用 Supabase 控制台或 `psql` / `supabase` CLI。
4. 回滚：为每个 `ALTER` 或 `CREATE` 提供对应 `DROP` / `ALTER ...` 的回滚 SQL，并在 repo 中保存一份 `migrations/` 目录。

示例回滚：

```sql
-- 删除 memory_tags（危险，需谨慎）
drop table if exists memory_tags;
```

---

## 8. 最佳实践 & 小贴士
- 在代码中严谨处理 UUID 与演示短 id 的兼容（见 `getMemoryComments` 的实现）。
- 对于上传（photos/videos）尽量把 `publicUrl` 存入 DB，并在前端对 URL 参数（如 `?v=timestamp`）做缓存破除处理。
- RLS 与触发器的修改要小步快跑，优先在 staging 验证。
- 将所有 SQL 迁移纳入代码仓库 `supabase/migrations/`，并使用 CI 进行审核。

---

## 9. 如果你遇到问题，按这个顺序检查（快速排查清单）
1. 在 Supabase 控制台执行相同的 SQL，确认错误是否可复现并查看错误码。
2. 检查是否为 RLS/权限问题（错误信息含 `policy` / `permission` / `violates row level security`）。
3. 检查字段类型是否匹配（uuid vs text / array vs jsonb）。
4. 对存储问题检查 bucket 权限与路径拼接。
5. 若涉及 Edge Function，打开 Functions 面板查看部署状态和日志。
6. 若是 auth/session，使用 `supabase.auth.getUser()` 在控制台或本地打印调试。

---

## 10. 我可以帮你做的后续事情（选项）
- 我可以根据当前数据库状态生成完整的 migration SQL，并在 `supabase/migrations/` 中创建文件。
- 我可以在 `src/api/supabase.ts` 中补充注释与 TypeScript 类型以便维护。
- 我可以为关键操作增加自动化测试脚本（使用 Supabase 测试实例）。

如需我继续：告诉我你希望我先做哪项（例如：生成 `profiles` + `memories` 的迁移 SQL 并提交到仓库）。
