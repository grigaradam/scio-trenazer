-- Endless generation can be limited to chosen exams and stops at a stock target, so it doesn't pay for tasks nobody
-- needs yet; it starts again by itself when users use the stock up. Needs 0016. Safe to run more than once.

alter table public.autogen_state
  -- null = every enabled exam, otherwise e.g. {osp} or {aj}
  add column if not exists exams text[],
  -- unseen tasks per type to keep ready for the most active user; 0 = no limit (endless)
  add column if not exists stock_target integer not null default 30 check (stock_target >= 0);

-- Stock per type: current-version tasks, and how many of them the most active user (served a generated task in the
-- last 14 days) has not seen yet – the user closest to running out decides when a type needs new tasks.
drop function if exists public.autogen_stock(integer);
create or replace function public.autogen_stock(p_version integer)
returns table (task_type text, ready bigint, stock bigint, active_users bigint)
language sql stable security definer set search_path = public as $$
  with ready as (
    select g.id, g.task_type
      from public.generated_tasks g
     where coalesce(public.admin_num(g.payload->>'v'), 1) >= p_version
  ), active as (
    select distinct s.user_id
      from public.task_seen s
     where s.created_at >= now() - interval '14 days' and s.task_ref like 'gen:%'
  ), seen as (
    select r.task_type, s.user_id, count(*) as n
      from public.task_seen s
      join ready r on s.task_ref = 'gen:' || r.id::text
     where s.user_id in (select a.user_id from active a)
     group by r.task_type, s.user_id
  )
  select r.task_type,
         count(*),
         count(*) - coalesce((select max(x.n) from seen x where x.task_type = r.task_type), 0),
         (select count(*) from seen x where x.task_type = r.task_type)
    from ready r
   group by r.task_type
$$;

revoke execute on function public.autogen_stock(integer) from public, anon, authenticated;
grant execute on function public.autogen_stock(integer) to service_role;
