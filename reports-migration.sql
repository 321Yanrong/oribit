-- Create reports table to store user reports
create table if not exists public.reports (
  id uuid default gen_random_uuid() primary key,
  reporter_id uuid references auth.users(id) on delete cascade not null,
  reported_user_id uuid references auth.users(id) on delete cascade not null,
  reason text not null,
  evidence_url text, -- Optional URL for screenshot evidence
  status text default 'pending', -- 'pending', 'reviewed', 'resolved', 'ignored'
  created_at timestamptz default now()
);

-- Enable Row Level Security
alter table public.reports enable row level security;

-- Policy 1: Users can create reports
create policy "Users can insert reports"
  on public.reports for insert
  with check (auth.uid() = reporter_id);

-- Policy 2: Users can view their own reports (optional, for history)
create policy "Users can view own reports"
  on public.reports for select
  using (auth.uid() = reporter_id);

-- Note: Admins can view all reports via the Supabase Dashboard / Table Editor
-- or you can create a specific policy for admin users if you have an 'is_admin' column or role.
