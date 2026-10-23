-- Czech vocative of display names ("Adam" → "Adame"), asked from AI once per distinct name
-- and shared by everyone with that name. Run in Supabase → SQL Editor. Safe to re-run.
create table if not exists public.name_forms (
  name text primary key,            -- lower-cased, trimmed nominative
  vocative text not null,
  created_at timestamptz not null default now()
);
alter table public.name_forms enable row level security;
grant all on public.name_forms to service_role;

alter table public.profiles add column if not exists display_name_vocative text;
