-- Legal: online withdrawal from the contract (§ 1830a OZ, "Odstoupit od smlouvy") and proof of what a
-- user accepted at sign-up / code activation. Run in Supabase → SQL Editor. Safe to re-run.

create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,                      -- short reference shown to the consumer, e.g. OD-7K3M9Q
  name text not null,
  email text not null,
  contract text not null,                        -- access code or account e-mail
  paid_on text,
  address text,
  bank_account text,
  reason text,
  statement text not null,                       -- exact wording of the withdrawal the consumer confirmed
  user_id uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  handled_at timestamptz                         -- operator sent the e-mail confirmation / refund
);
create index if not exists withdrawals_created_idx on public.withdrawals (created_at desc);
alter table public.withdrawals enable row level security; -- service role only
grant all on public.withdrawals to service_role;

alter table public.profiles add column if not exists terms_version text;
alter table public.profiles add column if not exists terms_accepted_at timestamptz;
-- consumer asked for access to start inside the 14-day withdrawal period (§ 1823 / § 1834 OZ)
alter table public.profiles add column if not exists start_requested_at timestamptz;
