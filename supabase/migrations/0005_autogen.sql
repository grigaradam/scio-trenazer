-- Endless background generation ("autogen"), driven by pg_cron every minute.
-- Run once in Supabase → SQL Editor. Safe to re-run. The cron schedule itself is set up
-- with the SQL shown in /dashboard (it contains your site URL and secret).

create table if not exists public.autogen_state (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default false,
  workers integer not null default 2 check (workers between 1 and 6),
  credits_exhausted_at timestamptz,
  last_tick_at timestamptz,
  last_error text,
  started_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.autogen_state (id) values (1) on conflict (id) do nothing;

-- one row per worker slot; a slot is busy while lease_until is in the future
create table if not exists public.autogen_leases (
  slot integer primary key,
  lease_until timestamptz not null default 'epoch',
  last_run_at timestamptz,
  runs integer not null default 0
);
insert into public.autogen_leases (slot) select g from generate_series(0, 5) g on conflict (slot) do nothing;

alter table public.autogen_state enable row level security;
alter table public.autogen_leases enable row level security;

-- Claim free slots (up to p_workers in total), each for p_seconds. Returns the claimed slot numbers.
create or replace function public.autogen_claim(p_workers integer, p_seconds integer)
returns setof integer language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.autogen_leases l
     set lease_until = now() + make_interval(secs => p_seconds), last_run_at = now(), runs = l.runs + 1
   where l.slot in (
     select slot from public.autogen_leases
      where slot < p_workers and lease_until < now()
      order by slot
      for update skip locked
   )
  returning l.slot;
end $$;

create or replace function public.autogen_release(p_slot integer)
returns void language sql security definer set search_path = public as $$
  update public.autogen_leases set lease_until = 'epoch' where slot = p_slot;
$$;

revoke execute on function public.autogen_claim(integer, integer) from public, anon, authenticated;
revoke execute on function public.autogen_release(integer) from public, anon, authenticated;
grant execute on function public.autogen_claim(integer, integer) to service_role;
grant execute on function public.autogen_release(integer) to service_role;
grant all on public.autogen_state, public.autogen_leases to service_role;

-- the scheduler needs these two extensions (available on the free plan)
create extension if not exists pg_cron;
create extension if not exists pg_net;
