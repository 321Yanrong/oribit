-- Create feedbacks table
create table if not exists public.feedbacks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  category text not null, -- 'bug', 'suggestion', 'complaint'
  content text not null,
  images text[], -- Array of image URLs
  status text default 'pending', -- 'pending', 'reviewed', 'resolved'
  app_version text,
  device_info text,
  created_at timestamptz default now()
);

-- Enable Row Level Security
alter table public.feedbacks enable row level security;

-- Policy: Users can insert their own feedbacks
create policy "Users can insert feedbacks"
  on public.feedbacks for insert
  with check (auth.uid() = user_id);

-- Policy: Users can view their own feedbacks (optional)
create policy "Users can view own feedbacks"
  on public.feedbacks for select
  using (auth.uid() = user_id);

-- Policy: Admins can view all (assuming authenticated for now, or use specific admin logic if implemented)
-- For now, allow authenticated users to view (for admin panel if needed, or secure it more later)
create policy "Authenticated users can select feedbacks"
  on public.feedbacks for select
  using (auth.role() = 'authenticated');
