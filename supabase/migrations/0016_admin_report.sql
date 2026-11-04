-- Exact numbers for the admin dashboard and the report for Claude. The dashboard used to fetch raw rows, which the
-- Supabase API caps at 1000 per request – with enough AI traffic the totals were silently partial. These functions
-- aggregate in the database instead. Needs 0015. Safe to run more than once.

-- re-runnable even when a function's columns change
drop function if exists public.admin_ai_summary(timestamptz);
drop function if exists public.admin_outcomes(timestamptz);
drop function if exists public.admin_pool_summary(integer, timestamptz);
drop function if exists public.admin_serves(timestamptz);
drop function if exists public.admin_ai_hourly(timestamptz);
drop function if exists public.admin_batch_summary();
drop function if exists public.admin_user_ai();

-- text → numeric, null when it isn't a number (validator scores come from jsonb)
create or replace function public.admin_num(p text)
returns numeric language sql immutable as $$
  select case when p ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then p::numeric end
$$;

-- AI calls grouped by what they were: kind, task type, generation stage, model, batch, autogen (no user).
create or replace function public.admin_ai_summary(p_since timestamptz)
returns table (
  kind text, task_type text, stage text, model text, batch boolean, autogen boolean,
  calls bigint, cost numeric, input_tokens bigint, output_tokens bigint, cache_read_tokens bigint,
  cache_write_tokens bigint, cache_write_1h_tokens bigint, thinking_tokens bigint
)
language sql stable security definer set search_path = public as $$
  select a.kind,
         coalesce(a.task_type, case when a.kind in ('accept', 'reject') then nullif(split_part(a.note, ':', 1), '') end),
         a.stage, a.model, a.batch, a.user_id is null,
         count(*), coalesce(sum(a.cost_usd), 0),
         coalesce(sum(a.input_tokens), 0), coalesce(sum(a.output_tokens), 0), coalesce(sum(a.cache_read_tokens), 0),
         coalesce(sum(a.cache_write_tokens), 0), coalesce(sum(a.cache_write_1h_tokens), 0), coalesce(sum(a.thinking_tokens), 0)
    from public.ai_calls a
   where a.created_at >= p_since
   group by 1, 2, 3, 4, 5, 6
$$;

-- Outcomes of generated candidates: accepted ("first", "revised variant", "first easy" …) and rejected by reason.
create or replace function public.admin_outcomes(p_since timestamptz)
returns table (task_type text, kind text, outcome text, revised boolean, n bigint)
language sql stable security definer set search_path = public as $$
  select coalesce(a.task_type, nullif(split_part(a.note, ':', 1), '')),
         a.kind,
         case
           when a.kind = 'accept' then trim(regexp_replace(coalesce(a.note, ''), '^[^:]*:', ''))
           when a.note ~ '^[^:]+:\s*(\[po opravě\]\s*)?chyba:' then 'technická chyba'
           when a.note ~ '^[^:]+:\s*(\[po opravě\]\s*)?generátor nevrátil' then 'neplatný JSON'
           when a.note ~ '^[^:]+:\s*(\[po opravě\]\s*)?opakování:' then 'opakování'
           when a.note ~ '^[^:]+:\s*(\[po opravě\]\s*)?struktura:.*styl:' then 'struktura: délka / jazyk'
           when a.note ~ '^[^:]+:\s*(\[po opravě\]\s*)?struktura:.*možnosti:' then 'struktura: tvar možností'
           when a.note ~ '^[^:]+:\s*(\[po opravě\]\s*)?struktura:.*klíče možností' then 'struktura: klíče'
           when a.note ~ '^[^:]+:\s*(\[po opravě\]\s*)?struktura:' then 'struktura: jiné'
           when a.note ~ '^[^:]+:\s*(\[po opravě\]\s*)?validátor:.*jiná odpověď než klíč' then 'validátor: jiný klíč'
           when a.note ~ '^[^:]+:\s*(\[po opravě\]\s*)?validátor:.*příliš lehká' then 'validátor: příliš lehká'
           when a.note ~ '^[^:]+:\s*(\[po opravě\]\s*)?validátor:.*nízké skóre' then 'validátor: nízké skóre'
           when a.note ~ '^[^:]+:\s*(\[po opravě\]\s*)?validátor:' then 'validátor: jiné'
           else 'jiné'
         end,
         coalesce(a.note ~ '\[po opravě\]', false),
         count(*)
    from public.ai_calls a
   where a.kind in ('accept', 'reject') and a.created_at >= p_since
   group by 1, 2, 3, 4
$$;

-- The pool per type: stock, easy tasks, variants, families, use, and validator scores of tasks created since p_since.
create or replace function public.admin_pool_summary(p_version integer, p_since timestamptz)
returns table (
  task_type text, total bigint, ready bigint, easy bigint, variants bigint, families bigint, serves bigint,
  served_tasks bigint, shared_tasks bigint, never_served bigint, quality numeric, new_ready bigint,
  difficulty numeric, distractors numeric, czech numeric, real_words numeric, scio_style numeric,
  unambiguous numeric, predicted numeric
)
language sql stable security definer set search_path = public as $$
  with t as (
    select g.id, g.task_type, g.served_count, g.quality, g.validator, g.created_at, g.payload,
           coalesce(public.admin_num(g.payload->>'v'), 1) >= p_version as ready,
           g.created_at >= p_since as recent
      from public.generated_tasks g
  )
  select t.task_type,
         count(*),
         count(*) filter (where t.ready),
         count(*) filter (where t.ready and t.payload->>'easy' = 'true'),
         count(*) filter (where t.ready and t.payload ? 'variantOf'),
         count(distinct coalesce(t.payload->>'family', t.id::text)) filter (where t.ready),
         coalesce(sum(t.served_count), 0),
         count(*) filter (where t.served_count > 0),
         count(*) filter (where t.served_count >= 2),
         count(*) filter (where t.ready and t.served_count = 0),
         avg(t.quality) filter (where t.ready),
         count(*) filter (where t.ready and t.recent),
         avg(public.admin_num(t.validator->'scores'->>'difficulty')) filter (where t.ready and t.recent),
         avg(public.admin_num(t.validator->'scores'->>'distractors')) filter (where t.ready and t.recent),
         avg(public.admin_num(t.validator->'scores'->>'czech')) filter (where t.ready and t.recent),
         avg(public.admin_num(t.validator->'scores'->>'real_words')) filter (where t.ready and t.recent),
         avg(public.admin_num(t.validator->'scores'->>'scio_style')) filter (where t.ready and t.recent),
         avg(public.admin_num(t.validator->'scores'->>'unambiguous')) filter (where t.ready and t.recent),
         avg(public.admin_num(t.validator->>'predictedSuccess')) filter (where t.ready and t.recent)
    from t
   group by t.task_type
$$;

-- How many generated tasks of each type users were served since p_since (demand), and by how many users.
create or replace function public.admin_serves(p_since timestamptz)
returns table (task_type text, serves bigint, users bigint)
language sql stable security definer set search_path = public as $$
  select g.task_type, count(*), count(distinct s.user_id)
    from public.task_seen s
    join public.generated_tasks g on s.task_ref = 'gen:' || g.id::text
   where s.created_at >= p_since and s.task_ref like 'gen:%'
   group by g.task_type
$$;

-- Hour by hour: accepted / rejected candidates and what generation, batches, explanations and chat cost.
create or replace function public.admin_ai_hourly(p_since timestamptz)
returns table (
  hour timestamptz, accepts bigint, rejects bigint, generation_cost numeric, batch_cost numeric,
  explain_cost numeric, chat_cost numeric
)
language sql stable security definer set search_path = public as $$
  select date_trunc('hour', a.created_at),
         count(*) filter (where a.kind = 'accept'),
         count(*) filter (where a.kind = 'reject'),
         coalesce(sum(a.cost_usd) filter (where a.kind in ('generate', 'validate', 'words', 'learn')), 0),
         coalesce(sum(a.cost_usd) filter (where a.batch), 0),
         coalesce(sum(a.cost_usd) filter (where a.kind = 'explain'), 0),
         coalesce(sum(a.cost_usd) filter (where a.kind = 'chat'), 0)
    from public.ai_calls a
   where a.created_at >= p_since
   group by 1
   order by 1
$$;

-- Batch jobs: how many per type / kind / stage, how many wait in a batch, and how long finished ones took.
create or replace function public.admin_batch_summary()
returns table (
  task_type text, kind text, stage text, jobs bigint, in_batch bigint,
  avg_minutes numeric, p50_minutes numeric, p90_minutes numeric
)
language sql stable security definer set search_path = public as $$
  select j.task_type, j.kind, j.stage, count(*), count(j.batch_id),
         (avg(extract(epoch from j.updated_at - j.created_at)) filter (where j.stage in ('done', 'failed')) / 60)::numeric,
         (percentile_cont(0.5) within group (order by extract(epoch from j.updated_at - j.created_at)::float8)
            filter (where j.stage in ('done', 'failed')) / 60)::numeric,
         (percentile_cont(0.9) within group (order by extract(epoch from j.updated_at - j.created_at)::float8)
            filter (where j.stage in ('done', 'failed')) / 60)::numeric
    from public.gen_jobs j
   group by 1, 2, 3
$$;

-- AI calls, cost and generated tasks per user (the user table of the dashboard).
create or replace function public.admin_user_ai()
returns table (user_id uuid, calls bigint, cost numeric, generated bigint)
language sql stable security definer set search_path = public as $$
  with c as (
    select a.user_id, count(*) as calls, coalesce(sum(a.cost_usd), 0) as cost
      from public.ai_calls a where a.user_id is not null group by a.user_id
  ), g as (
    select t.created_by as user_id, count(*) as generated
      from public.generated_tasks t where t.created_by is not null group by t.created_by
  )
  select coalesce(c.user_id, g.user_id), coalesce(c.calls, 0), coalesce(c.cost, 0), coalesce(g.generated, 0)
    from c full join g on g.user_id = c.user_id
$$;

revoke execute on function public.admin_ai_summary(timestamptz) from public, anon, authenticated;
revoke execute on function public.admin_outcomes(timestamptz) from public, anon, authenticated;
revoke execute on function public.admin_pool_summary(integer, timestamptz) from public, anon, authenticated;
revoke execute on function public.admin_serves(timestamptz) from public, anon, authenticated;
revoke execute on function public.admin_ai_hourly(timestamptz) from public, anon, authenticated;
revoke execute on function public.admin_batch_summary() from public, anon, authenticated;
revoke execute on function public.admin_user_ai() from public, anon, authenticated;
grant execute on function public.admin_ai_summary(timestamptz) to service_role;
grant execute on function public.admin_outcomes(timestamptz) to service_role;
grant execute on function public.admin_pool_summary(integer, timestamptz) to service_role;
grant execute on function public.admin_serves(timestamptz) to service_role;
grant execute on function public.admin_ai_hourly(timestamptz) to service_role;
grant execute on function public.admin_batch_summary() to service_role;
grant execute on function public.admin_user_ai() to service_role;
