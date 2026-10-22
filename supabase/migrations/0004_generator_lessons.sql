-- Self-improving generator: lessons distilled from validator rejections, per task type.
-- Run in Supabase → SQL Editor. Safe to re-run.
create table if not exists public.generator_lessons (
  task_type text primary key,
  lessons text not null,
  rejects_seen integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.generator_lessons enable row level security;
grant all on public.generator_lessons to service_role;
