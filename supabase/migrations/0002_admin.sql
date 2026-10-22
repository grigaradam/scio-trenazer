-- Admin dashboard: one-time invite codes, account blocking, AI cost tracking, traffic.
-- Run once in Supabase → SQL Editor (after 0001_init.sql). Safe to re-run.

-- ---------------------------------------------------------------- invite codes (one-time)
create table if not exists public.invite_codes (
  code text primary key,
  note text,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by uuid references auth.users on delete set null,
  revoked boolean not null default false
);

-- ---------------------------------------------------------------- profile additions
alter table public.profiles add column if not exists blocked boolean not null default false;
alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles add column if not exists invite_code text;

-- ---------------------------------------------------------------- AI cost log
create table if not exists public.ai_calls (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users on delete set null,
  kind text not null,                -- explain | chat | generate | validate
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  ok boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists ai_calls_created_idx on public.ai_calls (created_at desc);
create index if not exists ai_calls_user_idx on public.ai_calls (user_id);

-- ---------------------------------------------------------------- traffic (page views per user per day)
create table if not exists public.daily_traffic (
  day date not null,
  user_id uuid not null references auth.users on delete cascade,
  views integer not null default 0,
  primary key (day, user_id)
);

alter table public.invite_codes enable row level security;
alter table public.ai_calls enable row level security;
alter table public.daily_traffic enable row level security;
-- no client policies: service role only

-- ---------------------------------------------------------------- functions

-- Atomically reserve a code. Returns true when the code was free.
create or replace function public.claim_invite(p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_ok boolean;
begin
  update public.invite_codes set used_at = now()
  where code = upper(trim(p_code)) and used_at is null and not revoked
  returning true into v_ok;
  return coalesce(v_ok, false);
end $$;

-- Count a page view and mark the user as seen.
create or replace function public.track_view(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.daily_traffic (day, user_id, views) values (public.cz_today(), p_user, 1)
  on conflict (day, user_id) do update set views = daily_traffic.views + 1;
  update public.profiles set last_seen_at = now() where id = p_user;
end $$;

-- record_activity now also marks the user as seen (heartbeats keep "online now" accurate).
create or replace function public.record_activity(
  p_user uuid, p_seconds integer default 0, p_tasks integer default 0,
  p_correct integer default 0, p_xp integer default 0
) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_today date := public.cz_today();
  v_profile public.profiles;
begin
  insert into public.study_days (user_id, day, seconds, tasks, correct, xp)
  values (p_user, v_today, greatest(p_seconds, 0), p_tasks, p_correct, p_xp)
  on conflict (user_id, day) do update set
    seconds = study_days.seconds + excluded.seconds,
    tasks = study_days.tasks + excluded.tasks,
    correct = study_days.correct + excluded.correct,
    xp = study_days.xp + excluded.xp;

  select * into v_profile from public.profiles where id = p_user for update;

  if p_tasks > 0 and (v_profile.last_active_date is null or v_profile.last_active_date < v_today) then
    if v_profile.last_active_date = v_today - 1 then
      v_profile.streak_current := v_profile.streak_current + 1;
    else
      v_profile.streak_current := 1;
    end if;
    v_profile.last_active_date := v_today;
    v_profile.streak_best := greatest(v_profile.streak_best, v_profile.streak_current);
  end if;

  update public.profiles set
    xp = xp + p_xp,
    streak_current = v_profile.streak_current,
    streak_best = v_profile.streak_best,
    last_active_date = v_profile.last_active_date,
    last_seen_at = now()
  where id = p_user
  returning * into v_profile;

  return v_profile;
end $$;

revoke execute on function public.claim_invite(text) from public, anon, authenticated;
revoke execute on function public.track_view(uuid) from public, anon, authenticated;
revoke execute on function public.record_activity(uuid, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_invite(text) to service_role;
grant execute on function public.track_view(uuid) to service_role;
grant execute on function public.record_activity(uuid, integer, integer, integer, integer) to service_role;
grant all on public.invite_codes, public.ai_calls, public.daily_traffic to service_role;
grant all on all sequences in schema public to service_role;
