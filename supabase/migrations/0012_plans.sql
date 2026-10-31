-- Subscriptions without payments: every account is Basic or Pro, switched by hand in /dashboard.
-- Invite codes carry the plan and how long it lasts (counted from the moment the code is used).
-- Existing accounts and codes stay Pro, so nothing changes for them. Run in Supabase → SQL Editor. Safe to re-run.

alter table public.profiles add column if not exists plan text not null default 'pro';
alter table public.profiles add column if not exists plan_expires_at timestamptz; -- null = forever

alter table public.invite_codes add column if not exists plan text not null default 'pro';
alter table public.invite_codes add column if not exists duration_days integer; -- null = forever

do $$ begin
  alter table public.profiles add constraint profiles_plan_check check (plan in ('basic', 'pro'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.invite_codes add constraint invite_codes_plan_check check (plan in ('basic', 'pro'));
exception when duplicate_object then null; end $$;
