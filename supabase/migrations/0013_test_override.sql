-- Admin test mode (/dashboard → Uživatelé → Testovat): what the admin changed on an account,
-- so "Vrátit zpět" can undo exactly that – XP added, achievements granted / taken away, pet needs.
-- Run in Supabase → SQL Editor. Safe to re-run.

alter table public.profiles add column if not exists test_override jsonb;
