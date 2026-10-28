-- Push notifications: one row per device that allowed notifications (endpoint is unique per browser install).
-- Rows are written only through /api/push with the service role, so no RLS policies are needed.
-- Run in Supabase → SQL Editor. Safe to re-run.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text,
  -- Prague date of the last daily reminder, so each device gets at most one per day
  reminded_on date,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
grant all on public.push_subscriptions to service_role;
