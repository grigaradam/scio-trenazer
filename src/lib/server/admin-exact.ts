import "server-only";
import { GENERATOR_VERSION } from "@/lib/ai/version";
import { createAdminClient } from "@/lib/supabase/admin";

// Exact numbers for the dashboard and the report for Claude, aggregated in the database (migration 0016). Fetching
// raw rows was capped at 1000 per request by the Supabase API, so with enough AI traffic the totals were partial.
// loadExact() returns null when the functions are missing – the dashboard then keeps its old (row-based) numbers.

const GENERATION = ["generate", "validate", "words", "learn"];

type SummaryRow = {
  kind: string;
  task_type: string | null;
  stage: string | null;
  model: string | null;
  batch: boolean | null;
  autogen: boolean;
  calls: number;
  cost: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cache_write_1h_tokens: number;
  thinking_tokens: number;
};
type OutcomeRow = { task_type: string | null; kind: string; outcome: string; revised: boolean; n: number };
type PoolRow = {
  task_type: string;
  total: number;
  ready: number;
  easy: number;
  variants: number;
  families: number;
  serves: number;
  served_tasks: number;
  shared_tasks: number;
  never_served: number;
  quality: number | null;
  new_ready: number;
  difficulty: number | null;
  distractors: number | null;
  czech: number | null;
  real_words: number | null;
  scio_style: number | null;
  unambiguous: number | null;
  predicted: number | null;
};
type ServeRow = { task_type: string; serves: number; users: number };
type HourRow = { hour: string; accepts: number; rejects: number; generation_cost: number; batch_cost: number; explain_cost: number; chat_cost: number };
type BatchRow = { task_type: string; kind: string; stage: string; jobs: number; in_batch: number; avg_minutes: number | null; p50_minutes: number | null; p90_minutes: number | null };
type UserRow = { user_id: string; calls: number; cost: number; generated: number };

/** What the database functions return, as they come. */
export interface ExactRaw {
  all: SummaryRow[];
  d14: SummaryRow[];
  d7: SummaryRow[];
  today: SummaryRow[];
  sinceStart: SummaryRow[] | null;
  /** all candidate outcomes of the window (older rows get their type from the note) */
  outcomes: OutcomeRow[];
  /** outcomes since the first row with a task type – what per-type cost can be measured against */
  outcomesTyped: OutcomeRow[];
  /** start of the per-type cost window: the window start, or the first typed row when that is later (migration 0015) */
  typedSince: string;
  pool: PoolRow[];
  serves: ServeRow[];
  hourly: HourRow[];
  batch: BatchRow[] | null;
  users: UserRow[];
  /** latest reject notes of the window (low-score breakdown) */
  rejectNotes: string[];
}

export interface TypeInsight {
  type: string;
  // the pool now
  total: number;
  ready: number;
  neverServed: number;
  easy: number;
  variants: number;
  families: number;
  quality: number | null;
  // demand over 7 days
  serves7d: number;
  users7d: number;
  /** never-served tasks ÷ daily serves (null = no serves) */
  daysOfStock: number | null;
  // the 14-day window
  candidates: number;
  accepted: number;
  first: number;
  revised: number;
  easyAccepted: number;
  variantsAccepted: number;
  rejectedAttempts: number;
  finalFailures: number;
  generateCalls: number;
  validateCalls: number;
  generateCost: number;
  validateCost: number;
  otherCost: number;
  spend: number;
  perTask: number | null;
  perCandidate: number | null;
  thinkingShare: number | null;
  /** share of generator + validator input read from the prompt cache */
  cacheShare: number | null;
  batchShare: number | null;
  newReady: number;
  scores: Record<"difficulty" | "distractors" | "czech" | "real_words" | "scio_style" | "unambiguous" | "predicted", number | null>;
  rejects: { outcome: string; n: number }[];
}

export interface StageInsight {
  stage: string;
  model: string;
  batch: boolean;
  calls: number;
  cost: number;
  input: number;
  cacheRead: number;
  cacheWrite: number;
  cacheWrite1h: number;
  output: number;
  thinking: number;
}

export interface OptimizationData {
  windowDays: number;
  /** per-type cost and acceptance are measured from here (later than the window start until 0015 has run 14 days) */
  typedSince: string;
  windowStart: string;
  types: TypeInsight[];
  stages: StageInsight[];
  rejectReasons: { outcome: string; first: number; revised: number }[];
  lowScores: { score: string; n: number }[];
  lowScoreSample: number;
  hourly: { hour: string; accepts: number; rejects: number; generation: number; batch: number; explain: number; chat: number }[];
  batch: { type: string; kind: string; stage: string; jobs: number; inBatch: number; avgMin: number | null; p50Min: number | null; p90Min: number | null }[] | null;
  explain: { model: string; calls: number; cost: number }[];
  chat: { calls: number; cost: number };
  /** generation calls of the window logged before migration 0015 (no task type) */
  untyped: { calls: number; cost: number };
  window: { spend: number; generation: number; batchGeneration: number; explain: number; chat: number; other: number };
}

export interface Exact {
  totals: { all: number; d7: number; today: number };
  byKind: Record<string, { calls: number; cost: number }>;
  pool: { type: string; generated: number; ready: number; serves: number; easy: number; variants: number; servedTasks: number; sharedTasks: number; neverServed: number }[];
  users: Map<string, { calls: number; cost: number; generated: number }>;
  sinceStart: { generated: number; cost: number } | null;
  learning: Map<string, { first: number; revised: number; failed: number }>;
  optimization: OptimizationData;
}

const n = (x: unknown) => Number(x ?? 0) || 0;
const share = (part: number, whole: number) => (whole > 0 ? part / whole : null);
const isEasy = (outcome: string) => /\beasy\b/.test(outcome);

/** Calls the aggregate functions. null = migration 0016 hasn't run (or the database is the demo stand-in). */
export async function loadExact(o: { since14: string; since7: string; weekStart: string; today: string; since48h: string; autoStart: string | null }): Promise<ExactRaw | null> {
  const admin = createAdminClient();
  const rpc = async <T>(fn: string, args?: Record<string, unknown>): Promise<T[] | null> => {
    try {
      const { data, error } = await admin.rpc(fn, args);
      return error ? null : ((data ?? []) as T[]);
    } catch {
      return null;
    }
  };
  // Rows logged before migration 0015 have no task type: their cost can't be split by type, so per-type cost and
  // acceptance are both measured from the first typed row on – otherwise old accepts would meet only new costs.
  const firstTyped = await Promise.resolve(
    admin.from("ai_calls").select("created_at").not("task_type", "is", null).order("created_at", { ascending: true }).limit(1),
  ).then(
    (r) => (r.error ? null : ((r.data?.[0] as { created_at?: string } | undefined)?.created_at ?? null)),
    () => null,
  );
  const typedSince = firstTyped ? (firstTyped > o.since14 ? firstTyped : o.since14) : new Date().toISOString();
  const [all, d14, d7, today, sinceStart, outcomes, outcomesTyped, pool, serves, hourly, batch, users, notes] = await Promise.all([
    rpc<SummaryRow>("admin_ai_summary", { p_since: "1970-01-01T00:00:00Z" }),
    rpc<SummaryRow>("admin_ai_summary", { p_since: o.since14 }),
    rpc<SummaryRow>("admin_ai_summary", { p_since: o.weekStart }),
    rpc<SummaryRow>("admin_ai_summary", { p_since: o.today }),
    o.autoStart ? rpc<SummaryRow>("admin_ai_summary", { p_since: o.autoStart }) : Promise.resolve(null),
    rpc<OutcomeRow>("admin_outcomes", { p_since: o.since14 }),
    rpc<OutcomeRow>("admin_outcomes", { p_since: typedSince }),
    rpc<PoolRow>("admin_pool_summary", { p_version: GENERATOR_VERSION, p_since: o.since14 }),
    rpc<ServeRow>("admin_serves", { p_since: o.since7 }),
    rpc<HourRow>("admin_ai_hourly", { p_since: o.since48h }),
    rpc<BatchRow>("admin_batch_summary"),
    rpc<UserRow>("admin_user_ai"),
    admin
      .from("ai_calls")
      .select("note")
      .eq("kind", "reject")
      .gte("created_at", o.since14)
      .order("created_at", { ascending: false })
      .limit(1000)
      .then(
        (r) => (r.error ? [] : ((r.data ?? []) as { note: string | null }[]).map((x) => x.note ?? "").filter(Boolean)),
        () => [],
      ),
  ]);
  if (!all || !d14 || !d7 || !today || !outcomes || !outcomesTyped || !pool || !serves || !hourly || !users) return null;
  return { all, d14, d7, today, sinceStart, outcomes, outcomesTyped, typedSince, pool, serves, hourly, batch, users, rejectNotes: notes };
}

/** Everything the dashboard and the report need, computed from the raw aggregates (pure – tested on real SQL output). */
export function computeExact(raw: ExactRaw, types: string[], windowDays = 14, windowStart = new Date(Date.now() - windowDays * 86400000).toISOString()): Exact {
  const costOf = (rows: SummaryRow[]) => rows.reduce((a, r) => a + n(r.cost), 0);

  const byKind: Record<string, { calls: number; cost: number }> = {};
  for (const r of raw.all) {
    const k = (byKind[r.kind] ??= { calls: 0, cost: 0 });
    k.calls += n(r.calls);
    k.cost += n(r.cost);
  }

  // every type the data mentions, enabled types first
  const known = new Set(types);
  const extra = [...new Set([...raw.pool.map((p) => p.task_type), ...raw.d14.filter((r) => GENERATION.includes(r.kind)).map((r) => r.task_type)])].filter(
    (t): t is string => Boolean(t) && !known.has(t as string),
  );
  const allTypes = [...types, ...extra];

  const insights: TypeInsight[] = allTypes.map((type) => {
    const rows = raw.d14.filter((r) => r.task_type === type);
    const gen = rows.filter((r) => GENERATION.includes(r.kind));
    const sumOf = (xs: SummaryRow[], f: (r: SummaryRow) => number) => xs.reduce((a, r) => a + f(r), 0);
    const generate = gen.filter((r) => r.kind === "generate");
    const validate = gen.filter((r) => r.kind === "validate");
    const spend = sumOf(gen, (r) => n(r.cost));
    const io = [...generate, ...validate];
    const input = sumOf(io, (r) => n(r.input_tokens) + n(r.cache_read_tokens) + n(r.cache_write_tokens));
    const out = raw.outcomesTyped.filter((o) => o.task_type === type);
    const accepts = out.filter((o) => o.kind === "accept");
    const rejects = out.filter((o) => o.kind === "reject");
    const acc = (f: (outcome: string) => boolean) => accepts.filter((a) => f(a.outcome)).reduce((s, a) => s + n(a.n), 0);
    const accepted = acc(() => true);
    const candidates = sumOf(
      generate.filter((r) => r.stage === "fresh" || r.stage === "variant"),
      (r) => n(r.calls),
    );
    const pool = raw.pool.find((p) => p.task_type === type);
    const serves = raw.serves.find((s) => s.task_type === type);
    const daily = serves ? n(serves.serves) / 7 : 0;
    const buckets = new Map<string, number>();
    for (const r of rejects) buckets.set(r.outcome, (buckets.get(r.outcome) ?? 0) + n(r.n));
    const avg = (x: number | null | undefined) => (x === null || x === undefined ? null : Number(x));
    return {
      type,
      total: n(pool?.total),
      ready: n(pool?.ready),
      neverServed: n(pool?.never_served),
      easy: n(pool?.easy),
      variants: n(pool?.variants),
      families: n(pool?.families),
      quality: avg(pool?.quality),
      serves7d: n(serves?.serves),
      users7d: n(serves?.users),
      daysOfStock: daily ? n(pool?.never_served) / daily : null,
      candidates,
      accepted,
      first: acc((o) => o.startsWith("first") && !isEasy(o)),
      revised: acc((o) => o.startsWith("revised") && !isEasy(o)),
      easyAccepted: acc(isEasy),
      variantsAccepted: acc((o) => /\bvariant\b/.test(o)),
      rejectedAttempts: rejects.reduce((s, r) => s + n(r.n), 0),
      // a candidate is finally lost after a rejected revision, an invalid answer or an error
      finalFailures: rejects
        .filter((r) => r.revised || r.outcome === "neplatný JSON" || r.outcome === "technická chyba")
        .reduce((s, r) => s + n(r.n), 0),
      generateCalls: sumOf(generate, (r) => n(r.calls)),
      validateCalls: sumOf(validate, (r) => n(r.calls)),
      generateCost: sumOf(generate, (r) => n(r.cost)),
      validateCost: sumOf(validate, (r) => n(r.cost)),
      otherCost: sumOf(
        gen.filter((r) => r.kind === "words" || r.kind === "learn"),
        (r) => n(r.cost),
      ),
      spend,
      perTask: accepted ? spend / accepted : null,
      perCandidate: candidates ? spend / candidates : null,
      thinkingShare: share(
        sumOf(generate, (r) => n(r.thinking_tokens)),
        sumOf(generate, (r) => n(r.output_tokens)),
      ),
      cacheShare: share(
        sumOf(io, (r) => n(r.cache_read_tokens)),
        input,
      ),
      batchShare: share(
        sumOf(
          gen.filter((r) => r.batch),
          (r) => n(r.cost),
        ),
        spend,
      ),
      newReady: n(pool?.new_ready),
      scores: {
        difficulty: avg(pool?.difficulty),
        distractors: avg(pool?.distractors),
        czech: avg(pool?.czech),
        real_words: avg(pool?.real_words),
        scio_style: avg(pool?.scio_style),
        unambiguous: avg(pool?.unambiguous),
        predicted: avg(pool?.predicted),
      },
      rejects: [...buckets].map(([outcome, k]) => ({ outcome, n: k })).sort((a, b) => b.n - a.n),
    };
  });

  // generation calls of the window by stage, model and batch
  const stageMap = new Map<string, StageInsight>();
  for (const r of raw.d14.filter((x) => GENERATION.includes(x.kind))) {
    const stage = r.stage ?? (r.task_type ? r.kind : `${r.kind} (před 0015)`);
    const key = `${stage}|${r.model}|${Boolean(r.batch)}`;
    const s = stageMap.get(key) ?? { stage, model: r.model ?? "?", batch: Boolean(r.batch), calls: 0, cost: 0, input: 0, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0, output: 0, thinking: 0 };
    s.calls += n(r.calls);
    s.cost += n(r.cost);
    s.input += n(r.input_tokens);
    s.cacheRead += n(r.cache_read_tokens);
    s.cacheWrite += n(r.cache_write_tokens);
    s.cacheWrite1h += n(r.cache_write_1h_tokens);
    s.output += n(r.output_tokens);
    s.thinking += n(r.thinking_tokens);
    stageMap.set(key, s);
  }
  const order = ["fresh", "revise", "variant", "variant-revise", "validate", "words", "learn"];
  const stages = [...stageMap.values()].sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage) || b.cost - a.cost);

  const reasons = new Map<string, { first: number; revised: number }>();
  for (const r of raw.outcomes.filter((o) => o.kind === "reject")) {
    const e = reasons.get(r.outcome) ?? { first: 0, revised: 0 };
    if (r.revised) e.revised += n(r.n);
    else e.first += n(r.n);
    reasons.set(r.outcome, e);
  }

  // "nízké skóre: difficulty 5, distractors 5" – which scores fail how often
  const low = new Map<string, number>();
  for (const note of raw.rejectNotes) {
    const m = note.match(/nízké skóre: ([^|]+)/);
    if (!m) continue;
    for (const part of m[1].split(",")) {
      const name = part.trim().split(" ")[0];
      if (name) low.set(name, (low.get(name) ?? 0) + 1);
    }
  }

  const byModel = new Map<string, { calls: number; cost: number }>();
  for (const r of raw.d14.filter((x) => x.kind === "explain")) {
    const e = byModel.get(r.model ?? "?") ?? { calls: 0, cost: 0 };
    e.calls += n(r.calls);
    e.cost += n(r.cost);
    byModel.set(r.model ?? "?", e);
  }
  const kindCost = (kinds: string[]) => raw.d14.filter((r) => kinds.includes(r.kind)).reduce((a, r) => a + n(r.cost), 0);
  const untyped = raw.d14.filter((r) => GENERATION.includes(r.kind) && !r.task_type);

  // the learning panel counts every candidate of the window, typed or not
  const learning = new Map(
    allTypes.map((type) => {
      const out = raw.outcomes.filter((o) => o.task_type === type);
      const acc = (f: (outcome: string) => boolean) => out.filter((o) => o.kind === "accept" && f(o.outcome)).reduce((s, o) => s + n(o.n), 0);
      const failed = out
        .filter((o) => o.kind === "reject" && (o.revised || o.outcome === "neplatný JSON" || o.outcome === "technická chyba"))
        .reduce((s, o) => s + n(o.n), 0);
      return [type, { first: acc((x) => x.startsWith("first") && !isEasy(x)), revised: acc((x) => x.startsWith("revised") && !isEasy(x)), failed }];
    }),
  );

  const autogen = raw.sinceStart?.filter((r) => r.autogen) ?? null;
  return {
    totals: { all: costOf(raw.all), d7: costOf(raw.d7), today: costOf(raw.today) },
    byKind,
    pool: raw.pool.map((p) => ({
      type: p.task_type,
      generated: n(p.total),
      ready: n(p.ready),
      serves: n(p.serves),
      easy: n(p.easy),
      variants: n(p.variants),
      servedTasks: n(p.served_tasks),
      sharedTasks: n(p.shared_tasks),
      neverServed: n(p.never_served),
    })),
    users: new Map(raw.users.map((u) => [u.user_id, { calls: n(u.calls), cost: n(u.cost), generated: n(u.generated) }])),
    sinceStart: autogen
      ? {
          generated: autogen.filter((r) => r.kind === "accept").reduce((a, r) => a + n(r.calls), 0),
          cost: costOf(autogen),
        }
      : null,
    learning,
    optimization: {
      windowDays,
      typedSince: raw.typedSince,
      windowStart,
      types: insights,
      stages,
      rejectReasons: [...reasons].map(([outcome, e]) => ({ outcome, ...e })).sort((a, b) => b.first + b.revised - (a.first + a.revised)),
      lowScores: [...low].map(([score, k]) => ({ score, n: k })).sort((a, b) => b.n - a.n),
      lowScoreSample: raw.rejectNotes.length,
      hourly: raw.hourly.map((h) => ({
        hour: h.hour,
        accepts: n(h.accepts),
        rejects: n(h.rejects),
        generation: n(h.generation_cost),
        batch: n(h.batch_cost),
        explain: n(h.explain_cost),
        chat: n(h.chat_cost),
      })),
      batch: raw.batch
        ? raw.batch.map((b) => ({
            type: b.task_type,
            kind: b.kind,
            stage: b.stage,
            jobs: n(b.jobs),
            inBatch: n(b.in_batch),
            avgMin: b.avg_minutes === null ? null : Number(b.avg_minutes),
            p50Min: b.p50_minutes === null ? null : Number(b.p50_minutes),
            p90Min: b.p90_minutes === null ? null : Number(b.p90_minutes),
          }))
        : null,
      explain: [...byModel].map(([model, e]) => ({ model, ...e })),
      chat: {
        calls: raw.d14.filter((r) => r.kind === "chat").reduce((a, r) => a + n(r.calls), 0),
        cost: kindCost(["chat"]),
      },
      untyped: { calls: untyped.reduce((a, r) => a + n(r.calls), 0), cost: untyped.reduce((a, r) => a + n(r.cost), 0) },
      window: {
        spend: costOf(raw.d14),
        generation: kindCost(GENERATION),
        batchGeneration: raw.d14.filter((r) => GENERATION.includes(r.kind) && r.batch).reduce((a, r) => a + n(r.cost), 0),
        explain: kindCost(["explain"]),
        chat: kindCost(["chat"]),
        other: kindCost(["name"]),
      },
    },
  };
}
