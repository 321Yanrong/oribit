-- notifications table migration
-- Run this in Supabase SQL Editor

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  type text not null,
  -- type values: 'friend_request' | 'friend_accepted' | 'at' | 'comment' | 'friend_bind'
  actor_id uuid references profiles(id) on delete set null,
  entity_id uuid,     -- memory_id or friendship_id depending on type
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_idx on notifications(user_id);
create index if not exists notifications_user_unread_idx on notifications(user_id, read) where read = false;

alter table notifications enable row level security;

-- Users can only read their own notifications
create policy "users_see_own_notifications"
  on notifications for select
  using (auth.uid() = user_id);

-- Users can mark their own notifications as read
create policy "users_update_own_notifications"
  on notifications for update
  using (auth.uid() = user_id);

-- Only service role / edge functions can insert (bypass RLS)
-- The insert policy uses "with check (true)" which means any authenticated insert is allowed.
-- Actual access control is enforced by the API functions and Edge Functions.
create policy "authenticated_insert_notifications"
  on notifications for insert
  with check (true);
