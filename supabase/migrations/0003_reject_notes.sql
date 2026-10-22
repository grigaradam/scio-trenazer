-- Reasons for rejected AI tasks (shown in /dashboard). Run in Supabase → SQL Editor. Safe to re-run.
alter table public.ai_calls add column if not exists note text;
