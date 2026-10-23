-- Shared cache of the AI tutor's reply to the FIRST question in a task chat (suggestion chips and
-- other common opening questions), so the same question on the same task is generated only once.
-- Keyed by task, normalized question and the student's answer (the reply may refer to it; '' = none).
-- Run in Supabase → SQL Editor. Safe to re-run.
create table if not exists public.chat_cache (
  task_ref text not null,
  question text not null,
  user_answer text not null default '',
  reply text not null,
  model text,
  created_at timestamptz not null default now(),
  primary key (task_ref, question, user_answer)
);

-- contains answer keys → service role only (no client policies)
alter table public.chat_cache enable row level security;
