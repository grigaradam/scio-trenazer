-- Push reminders go out several times a day (11:00, 15:00, 18:00), so each device remembers the last
-- slot it got ("2026-10-28 15") instead of just the date. Run in Supabase → SQL Editor. Safe to re-run.
alter table public.push_subscriptions add column if not exists reminded_slot text;
alter table public.push_subscriptions drop column if exists reminded_on;
