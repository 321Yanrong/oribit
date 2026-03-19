-- 帮助中心「有用/没用」反馈表
-- 执行方式：在 Supabase SQL Editor 运行本文件

create extension if not exists pgcrypto;

create table if not exists public.help_question_feedback (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  category text not null check (category in ('hot', 'account', 'settings')),
  vote text not null check (vote in ('useful', 'not_useful')),
  user_id uuid null references public.profiles(id) on delete set null,
  username text null,
  app_version text null,
  build_time text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_help_question_feedback_created_at
  on public.help_question_feedback (created_at desc);

create index if not exists idx_help_question_feedback_question
  on public.help_question_feedback (question);

alter table public.help_question_feedback enable row level security;

-- 登录用户可提交反馈
create policy if not exists "authenticated can insert help feedback"
on public.help_question_feedback
for insert
to authenticated
with check (auth.uid() is not null);

-- 登录用户可查看自己的反馈（可选）
create policy if not exists "authenticated can read own help feedback"
on public.help_question_feedback
for select
to authenticated
using (auth.uid() = user_id);
