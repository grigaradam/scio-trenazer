-- One-time retake of a section that ended up empty in a finished test (e.g. answers lost when
-- the app closed). Set when the retake is granted, so each attempt can be retaken only once.
-- Run in Supabase → SQL Editor. Safe to re-run.
alter table public.attempts add column if not exists retake_section text
  check (retake_section in ('verbal', 'analytic'));
