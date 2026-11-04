-- Cheaper AI tasks: cost per task type, background generation through the Message Batches API
-- (50 % off), easy tasks and variant families. Safe to run more than once.

-- ---------------------------------------------------------------- cost tracking per task type
-- Every generator/validator call records its task type and stage, whether it ran in a batch,
-- how many output tokens were thinking and how much was written to the 1-hour cache.
alter table public.ai_calls
  add column if not exists task_type text,
  add column if not exists stage text,
  add column if not exists batch boolean not null default false,
  add column if not exists thinking_tokens integer not null default 0,
  add column if not exists cache_write_1h_tokens integer not null default 0;
create index if not exists ai_calls_type_idx on public.ai_calls (task_type, created_at desc);

-- ---------------------------------------------------------------- batch generation
-- One row per candidate task moving through generate → validate (→ revise → validate).
-- batch_id is set while its current request waits in an Anthropic message batch.
create table if not exists public.gen_jobs (
  id uuid primary key default gen_random_uuid(),
  exam text not null,
  task_type text not null,
  kind text not null default 'fresh' check (kind in ('fresh', 'variant')),
  parent_id uuid references public.generated_tasks on delete set null,
  user_id uuid references auth.users on delete set null,
  stage text not null default 'generate' check (stage in ('generate', 'validate', 'done', 'failed')),
  attempt integer not null default 0,
  batch_id text,
  state jsonb not null default '{}'::jsonb,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gen_jobs_stage_idx on public.gen_jobs (stage, batch_id);
create index if not exists gen_jobs_type_idx on public.gen_jobs (task_type, stage);
alter table public.gen_jobs enable row level security;
grant all on public.gen_jobs to service_role;

-- sync = generation runs inside the cron worker (full price), batch = through the Batch API (half price)
alter table public.autogen_state
  add column if not exists mode text not null default 'sync' check (mode in ('sync', 'batch')),
  add column if not exists batch_lock_until timestamptz;

-- One cron tick at a time works on the batches (independent of the synchronous worker slots).
create or replace function public.batch_claim(p_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare got boolean;
begin
  update public.autogen_state
     set batch_lock_until = now() + make_interval(secs => p_seconds)
   where id = 1 and (batch_lock_until is null or batch_lock_until < now())
  returning true into got;
  return coalesce(got, false);
end $$;

create or replace function public.batch_release()
returns void language sql security definer set search_path = public as $$
  update public.autogen_state set batch_lock_until = null where id = 1;
$$;

revoke execute on function public.batch_claim(integer) from public, anon, authenticated;
revoke execute on function public.batch_release() from public, anon, authenticated;
grant execute on function public.batch_claim(integer) to service_role;
grant execute on function public.batch_release() to service_role;

-- ---------------------------------------------------------------- variant families
-- payload.family = id of the task a variant was derived from (an original task is its own family)
create index if not exists generated_tasks_family_idx on public.generated_tasks ((payload->>'family'));
