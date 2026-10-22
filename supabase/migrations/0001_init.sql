-- SCIO Trenažér – initial schema.
-- Run once in Supabase → SQL Editor (or `supabase db push`).
--
-- Security model: the browser only ever READS its own rows (RLS select policies).
-- Every write goes through Next.js server routes using the service-role key,
-- after the server has verified the user. That keeps XP, scores and answer keys tamper-proof.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  exam text not null default 'osp',
  onboarded boolean not null default false,
  xp integer not null default 0,
  streak_current integer not null default 0,
  streak_best integer not null default 0,
  last_active_date date,
  daily_goal_min integer not null default 20,
  practice_time_limit_sec integer,           -- null = no limit
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- attempts (full tests)
create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  exam text not null default 'osp',
  test_id text not null,
  is_diagnostic boolean not null default false,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  section_index integer not null default 0,
  time_left jsonb not null,                   -- {"verbal": 2100, "analytic": 3000}
  answers jsonb not null default '{}'::jsonb, -- {"7": ["B","G"], "12": ["A"]}
  flags integer[] not null default '{}',
  pause_count integer not null default 0,
  active_seconds integer not null default 0,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  score numeric,
  max_score numeric,
  result jsonb
);
create index if not exists attempts_user_idx on public.attempts (user_id, started_at desc);

-- ---------------------------------------------------------------- mistakes
create table if not exists public.mistakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  exam text not null default 'osp',
  task_ref text not null,                     -- "test:<testId>:<n>" | "gen:<uuid>"
  task_type text not null,
  source text not null check (source in ('test', 'practice')),
  attempt_id uuid references public.attempts on delete set null,
  status text not null default 'open' check (status in ('open', 'fixed')),
  tries integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, task_ref)
);
create index if not exists mistakes_user_idx on public.mistakes (user_id, status, task_type);

-- ---------------------------------------------------------------- AI generated task pool (shared)
create table if not exists public.generated_tasks (
  id uuid primary key default gen_random_uuid(),
  exam text not null default 'osp',
  task_type text not null,
  payload jsonb not null,                     -- Group (with answers + solution)
  quality numeric,
  validator jsonb,
  model text,
  seed_refs text[] not null default '{}',
  created_by uuid references auth.users on delete set null,
  served_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists generated_tasks_type_idx on public.generated_tasks (exam, task_type, served_count, created_at);

-- tasks already served to a user (never serve twice)
create table if not exists public.task_seen (
  user_id uuid not null references auth.users on delete cascade,
  task_ref text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, task_ref)
);

-- every practice answer (stats, accuracy per type)
create table if not exists public.practice_answers (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  exam text not null default 'osp',
  task_ref text not null,
  task_type text not null,
  correct boolean not null,
  answer jsonb,
  time_ms integer,
  created_at timestamptz not null default now()
);
create index if not exists practice_answers_user_idx on public.practice_answers (user_id, created_at desc);

-- ---------------------------------------------------------------- study days (heatmap, daily goal)
create table if not exists public.study_days (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  seconds integer not null default 0,
  tasks integer not null default 0,
  correct integer not null default 0,
  xp integer not null default 0,
  primary key (user_id, day)
);

-- ---------------------------------------------------------------- achievements
create table if not exists public.achievements (
  user_id uuid not null references auth.users on delete cascade,
  code text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, code)
);

-- ---------------------------------------------------------------- AI caches & budget
create table if not exists public.explanations (
  task_ref text primary key,
  content jsonb not null,
  model text,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  kind text not null,
  count integer not null default 0,
  primary key (user_id, day, kind)
);

-- ---------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.attempts enable row level security;
alter table public.mistakes enable row level security;
alter table public.generated_tasks enable row level security;
alter table public.task_seen enable row level security;
alter table public.practice_answers enable row level security;
alter table public.study_days enable row level security;
alter table public.achievements enable row level security;
alter table public.explanations enable row level security;
alter table public.ai_usage enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for select using (auth.uid() = id);
drop policy if exists "own attempts" on public.attempts;
create policy "own attempts" on public.attempts for select using (auth.uid() = user_id);
drop policy if exists "own mistakes" on public.mistakes;
create policy "own mistakes" on public.mistakes for select using (auth.uid() = user_id);
drop policy if exists "own seen" on public.task_seen;
create policy "own seen" on public.task_seen for select using (auth.uid() = user_id);
drop policy if exists "own practice" on public.practice_answers;
create policy "own practice" on public.practice_answers for select using (auth.uid() = user_id);
drop policy if exists "own days" on public.study_days;
create policy "own days" on public.study_days for select using (auth.uid() = user_id);
drop policy if exists "own achievements" on public.achievements;
create policy "own achievements" on public.achievements for select using (auth.uid() = user_id);
drop policy if exists "own usage" on public.ai_usage;
create policy "own usage" on public.ai_usage for select using (auth.uid() = user_id);
-- generated_tasks and explanations: no client policies (contain answer keys) → service role only.

-- ---------------------------------------------------------------- functions (called by the server)

-- Today in Czech time.
create or replace function public.cz_today() returns date
language sql stable as $$ select (now() at time zone 'Europe/Prague')::date $$;

-- Record study activity: time, tasks, xp; maintain streak. Returns the updated profile row.
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

  -- streak counts days with at least one solved task (or a finished test, which passes p_tasks > 0)
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
    last_active_date = v_profile.last_active_date
  where id = p_user
  returning * into v_profile;

  return v_profile;
end $$;

-- Pick generated tasks of a type the user has never been served (oldest/least served first).
create or replace function public.pick_generated_tasks(
  p_user uuid, p_exam text, p_type text, p_limit integer
) returns setof public.generated_tasks
language sql stable as $$
  select g.* from public.generated_tasks g
  where g.exam = p_exam and g.task_type = p_type
    and not exists (
      select 1 from public.task_seen s where s.user_id = p_user and s.task_ref = 'gen:' || g.id::text
    )
  order by g.served_count asc, g.created_at asc
  limit p_limit
$$;

-- Increment AI usage counter, return the new count.
create or replace function public.bump_ai_usage(p_user uuid, p_kind text)
returns integer language plpgsql security definer set search_path = public as $$
declare v integer;
begin
  insert into public.ai_usage (user_id, day, kind, count) values (p_user, public.cz_today(), p_kind, 1)
  on conflict (user_id, day, kind) do update set count = ai_usage.count + 1
  returning count into v;
  return v;
end $$;

-- These functions are for the server (service role) only.
revoke execute on function public.record_activity(uuid, integer, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.pick_generated_tasks(uuid, text, text, integer) from public, anon, authenticated;
revoke execute on function public.bump_ai_usage(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- grants (Supabase defaults, made explicit)
grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on function public.record_activity(uuid, integer, integer, integer, integer) to service_role;
grant execute on function public.pick_generated_tasks(uuid, text, text, integer) to service_role;
grant execute on function public.bump_ai_usage(uuid, text) to service_role;
