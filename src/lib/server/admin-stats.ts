import "server-only";
import { GENERATOR_VERSION } from "@/lib/ai/generate";
import { computeExact, loadExact, type OptimizationData } from "./admin-exact";
import { DECKS } from "@/lib/ai/decks";
import { EASY_SHARE, EASY_WINDOW, FAMILY_GAP_DAYS, FAMILY_GAP_TASKS, FAMILY_MAX, VARIANT_SHARE, VARIANT_TYPES } from "@/lib/ai/families";
import { autogenTypes, typeStock } from "./autogen";
import { batchStatus, JOBS_PER_WORKER, PER_TYPE } from "./batch-gen";
import { EXAMS, TASK_TYPES } from "@/lib/content/exams";
import { AI, vapidEnv } from "@/lib/env";
import { levelInfo } from "@/lib/gamification";
import { effectivePlan, planExpired, type Plan } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { czToday } from "./queries";
import type { Profile } from "./types";
import { lastDays } from "@/lib/days";

export interface AdminUserRow {
  id: string;
  email: string | null;
  name: string | null;
  createdAt: string | null;
  lastSeenAt: string | null;
  lastSignInAt: string | null;
  level: number;
  xp: number;
  streak: number;
  streakBest: number;
  hours: number;
  tasks: number;
  tests: number;
  generated: number;
  aiCalls: number;
  costUsd: number;
  blocked: boolean;
  inviteCode: string | null;
  /** null = migration 0012 hasn't run */
  plan: Plan | null;
  /** The plan in force (an expired Pro is Basic). */
  activePlan: Plan;
  planExpiresAt: string | null;
  planExpired: boolean;
  /** Devices with push notifications turned on. */
  pushDevices: number;
}

export interface InviteRow {
  code: string;
  note: string | null;
  createdAt: string;
  usedAt: string | null;
  usedBy: string | null;
  usedByEmail: string | null;
  revoked: boolean;
  plan: Plan | null;
  durationDays: number | null;
}

export interface AdminStats {
  migrationMissing: boolean;
  /** Migration 0012 (plans) has run. */
  plansReady: boolean;
  totals: {
    users: number;
    blocked: number;
    pro: number;
    onlineNow: number;
    activeToday: number;
    activeWeek: number;
    hours: number;
    tasksSolved: number;
    testsCompleted: number;
  };
  cost: { total: number; today: number; week: number; byKind: Record<string, { calls: number; cost: number }> };
  pool: {
    generated: number;
    generationAttempts: number;
    acceptRate: number | null;
    serves: number;
    servedTasks: number;
    recycledServes: number;
    sharedTasks: number;
    waiting: number;
    reuseFactor: number | null;
    costPerServe: number | null;
    byType: {
      type: string;
      generated: number;
      ready: number;
      serves: number;
      easy: number;
      variants: number;
      /** unseen tasks for the most active user (null = migration 0017 hasn't run) */
      stock: number | null;
    }[];
  };
  /** Cost per accepted task by type over 14 days (null = migration 0015 hasn't run). */
  costByType: TypeCost[] | null;
  /** Everything for optimizing AI cost and quality, exact from the database (null = migration 0016 hasn't run). */
  optimization: OptimizationData | null;
  traffic: { day: string; users: number; views: number; minutes: number }[];
  rejects: { at: string; note: string }[];
  config: Record<string, string | number>;
  autogen: {
    available: boolean;
    enabled: boolean;
    workers: number;
    /** null = migration 0015 hasn't run (no batch mode yet) */
    mode: "sync" | "batch" | null;
    /** Batch mode: candidates in flight. */
    batch: { generating: number; validating: number; variants: number; waiting: number; batches: number } | null;
    /** Exams endless generation fills (null = all enabled); undefined = migration 0017 hasn't run. */
    exams: string[] | null | undefined;
    /** Unseen tasks per type to keep (0 = no limit); null = migration 0017 hasn't run. */
    stockTarget: number | null;
    /** Every chosen type has reached the stock target – generation waits until users use it up. */
    stockFull: boolean;
    busy: number;
    lastTickAt: string | null;
    cronAlive: boolean;
    creditsExhaustedAt: string | null;
    lastError: string | null;
    startedAt: string | null;
    generatedSinceStart: number;
    costSinceStart: number;
    secret: string | null;
  };
  learning: { type: string; first: number; revised: number; failed: number; lessons: string | null; lessonsAt: string | null }[];
  users: AdminUserRow[];
  invites: InviteRow[];
  /** configured: VAPID keys are set; available: migration 0010 has run. */
  push: {
    configured: boolean;
    available: boolean;
    /** Migration 0011 (reminded_slot) has run – without it the scheduled reminders can't go out. */
    slotsReady: boolean;
    devices: number;
    /** Latest scheduled reminder any device got, e.g. "2026-10-28 15". */
    lastSlot: string | null;
  };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export interface TypeCost {
  type: string;
  accepted: number;
  first: number;
  revised: number;
  easy: number;
  variants: number;
  rejected: number;
  generateCost: number;
  validateCost: number;
  /** word proposals and lesson distilling */
  otherCost: number;
  /** generation cost per accepted task (null = nothing accepted) */
  perTask: number | null;
  /** share of generator output tokens spent on thinking */
  thinkingShare: number | null;
  /** share of the cost that ran through the Batch API */
  batchShare: number | null;
  /** share of generator + validator input read from the prompt cache (null = not measured) */
  cacheShare: number | null;
}

type CostRow = {
  kind: string;
  task_type: string | null;
  cost_usd: number;
  thinking_tokens: number;
  output_tokens: number;
  batch: boolean;
  note: string | null;
};

/** Cost per accepted task for every type, from ai_calls rows tagged with their task type (migration 0015). */
function typeCosts(rows: CostRow[], types: string[]): TypeCost[] {
  return types.map((type) => {
    const mine = rows.filter((r) => r.task_type === type);
    const cost = (kinds: string[]) => sum(mine.filter((r) => kinds.includes(r.kind)).map((r) => Number(r.cost_usd)));
    const accepts = mine.filter((r) => r.kind === "accept");
    const gens = mine.filter((r) => r.kind === "generate");
    const spend = cost(["generate", "validate", "words", "learn"]);
    const output = sum(gens.map((g) => g.output_tokens));
    return {
      type,
      accepted: accepts.length,
      first: accepts.filter((a) => /: first\b/.test(a.note ?? "") && !/\beasy$/.test(a.note ?? "")).length,
      revised: accepts.filter((a) => /: revised\b/.test(a.note ?? "") && !/\beasy$/.test(a.note ?? "")).length,
      easy: accepts.filter((a) => /\beasy$/.test(a.note ?? "")).length,
      variants: accepts.filter((a) => /\bvariant\b/.test(a.note ?? "")).length,
      rejected: mine.filter((r) => r.kind === "reject").length,
      generateCost: cost(["generate"]),
      validateCost: cost(["validate"]),
      otherCost: cost(["words", "learn"]),
      perTask: accepts.length ? spend / accepts.length : null,
      thinkingShare: output ? sum(gens.map((g) => g.thinking_tokens ?? 0)) / output : null,
      batchShare: spend ? sum(mine.filter((r) => r.batch && r.kind !== "accept" && r.kind !== "reject").map((r) => Number(r.cost_usd))) / spend : null,
      cacheShare: null,
    };
  });
}


export async function loadAdminStats(): Promise<AdminStats> {
  const admin = createAdminClient();
  const week = lastDays(7);
  const [usersRes, profilesRes, daysRes, genRes, seenRes, aiRes, attemptsRes, invitesRes, trafficRes] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from("profiles").select("*"),
    admin.from("study_days").select("user_id,day,seconds,tasks"),
    admin.from("generated_tasks").select("id,created_by,served_count,task_type,created_at,v:payload->v,easy:payload->easy,variantOf:payload->>variantOf"),
    admin.from("task_seen").select("task_ref", { count: "exact", head: true }).like("task_ref", "gen:%"),
    admin.from("ai_calls").select("user_id,kind,cost_usd,created_at,ok"),
    admin.from("attempts").select("user_id").eq("status", "completed"),
    admin.from("invite_codes").select("*").order("created_at", { ascending: false }),
    admin.from("daily_traffic").select("day,user_id,views").gte("day", week[0]),
  ]);
  const migrationMissing = Boolean(aiRes.error || invitesRes.error || trafficRes.error);
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const [outcomesRes, lessonsRes, costRes, batch] = await Promise.all([
    admin.from("ai_calls").select("kind,note").in("kind", ["accept", "reject"]).gte("created_at", since).limit(5000),
    admin.from("generator_lessons").select("task_type,lessons,updated_at"),
    // separate query: without migration 0015 the columns are missing and only this panel stays empty
    admin
      .from("ai_calls")
      .select("kind,task_type,cost_usd,thinking_tokens,output_tokens,batch,note")
      .gte("created_at", since)
      .in("kind", ["generate", "validate", "words", "learn", "accept", "reject"])
      .limit(20000),
    batchStatus(),
  ]);
  const outcomes = (outcomesRes.error ? [] : (outcomesRes.data ?? [])) as { kind: string; note: string | null }[];
  const lessonRows = (lessonsRes.error ? [] : (lessonsRes.data ?? [])) as { task_type: string; lessons: string; updated_at: string }[];
  const [autoStateRes, leasesRes] = await Promise.all([
    admin.from("autogen_state").select("*").eq("id", 1).maybeSingle(),
    admin.from("autogen_leases").select("slot,lease_until"),
  ]);
  const autoState = autoStateRes.error ? null : (autoStateRes.data as Record<string, unknown> | null);
  const autoStart = (autoState?.started_at as string | null) ?? null;
  const enabledTypes = TASK_TYPES.filter((t) => EXAMS.some((e) => e.id === t.exam && e.enabled)).map((t) => t.id as string);
  const todayIso = `${czToday()}T00:00:00Z`;
  const rawExact = await loadExact({
    since14: since,
    since7: new Date(Date.now() - 7 * 86400000).toISOString(),
    weekStart: `${new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)}T00:00:00Z`,
    today: todayIso,
    since48h: new Date(Date.now() - 48 * 3600000).toISOString(),
    autoStart,
  });
  // exact aggregates (migration 0016) replace the row-based numbers, which the API caps at 1000 rows per query
  const exact = rawExact ? computeExact(rawExact, enabledTypes) : null;
  const stock = await typeStock();
  const stockTarget = autoState && "stock_target" in autoState ? Number(autoState.stock_target ?? 0) : null;
  const autoExams = autoState && "exams" in autoState ? ((autoState.exams as string[] | null) ?? null) : undefined;
  const stockFull = Boolean(
    stock && stockTarget && autogenTypes({ exams: autoExams ?? null }).every((t) => (stock.get(t.id)?.stock ?? 0) >= stockTarget),
  );
  const rejectsRes = await admin
    .from("ai_calls")
    .select("created_at,note")
    .eq("kind", "reject")
    .order("created_at", { ascending: false })
    .limit(40);
  let pushRes = await admin.from("push_subscriptions").select("user_id,reminded_slot");
  const slotsReady = !pushRes.error;
  if (pushRes.error) pushRes = await admin.from("push_subscriptions").select("user_id");
  const pushRows = (pushRes.error ? [] : (pushRes.data ?? [])) as { user_id: string; reminded_slot?: string | null }[];

  const authUsers = usersRes.data?.users ?? [];
  const profiles = (profilesRes.data ?? []) as Profile[];
  const days = (daysRes.data ?? []) as { user_id: string; day: string; seconds: number; tasks: number }[];
  const gen = (genRes.data ?? []) as {
    id: string;
    created_by: string | null;
    served_count: number;
    task_type: string;
    v?: number | null;
    easy?: boolean | null;
    variantOf?: string | null;
  }[];
  const ai = (aiRes.data ?? []) as { user_id: string | null; kind: string; cost_usd: number; created_at: string; ok: boolean }[];
  const attempts = (attemptsRes.data ?? []) as { user_id: string }[];
  const invites = (invitesRes.data ?? []) as {
    code: string;
    note: string | null;
    created_at: string;
    used_at: string | null;
    used_by: string | null;
    revoked: boolean;
    plan?: string;
    duration_days?: number | null;
  }[];
  const traffic = (trafficRes.data ?? []) as { day: string; user_id: string; views: number }[];

  const today = czToday();
  const emailOf = new Map(authUsers.map((u) => [u.id, u.email ?? null]));
  const now = Date.now();

  const users: AdminUserRow[] = authUsers.map((u) => {
    const p = profiles.find((x) => x.id === u.id);
    const myDays = days.filter((d) => d.user_id === u.id);
    const myAi = ai.filter((a) => a.user_id === u.id);
    return {
      id: u.id,
      email: u.email ?? null,
      name: p?.display_name ?? null,
      createdAt: u.created_at ?? null,
      lastSeenAt: p?.last_seen_at ?? null,
      lastSignInAt: u.last_sign_in_at ?? null,
      level: levelInfo(p?.xp ?? 0).level,
      xp: p?.xp ?? 0,
      streak: p?.streak_current ?? 0,
      streakBest: p?.streak_best ?? 0,
      hours: sum(myDays.map((d) => d.seconds)) / 3600,
      tasks: sum(myDays.map((d) => d.tasks)),
      tests: attempts.filter((a) => a.user_id === u.id).length,
      generated: exact ? (exact.users.get(u.id)?.generated ?? 0) : gen.filter((g) => g.created_by === u.id).length,
      aiCalls: exact ? (exact.users.get(u.id)?.calls ?? 0) : myAi.length,
      costUsd: exact ? (exact.users.get(u.id)?.cost ?? 0) : sum(myAi.map((a) => Number(a.cost_usd))),
      blocked: Boolean(p?.blocked),
      inviteCode: p?.invite_code ?? null,
      plan: p?.plan === "basic" || p?.plan === "pro" ? p.plan : null,
      activePlan: effectivePlan(p ?? {}),
      planExpiresAt: p?.plan_expires_at ?? null,
      planExpired: planExpired(p ?? {}),
      pushDevices: pushRows.filter((r) => r.user_id === u.id).length,
    };
  });
  users.sort((a, b) => (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? ""));

  const rowKinds: Record<string, { calls: number; cost: number }> = {};
  for (const a of ai) {
    const k = (rowKinds[a.kind] ??= { calls: 0, cost: 0 });
    k.calls++;
    k.cost += Number(a.cost_usd);
  }
  const byKind = exact?.byKind ?? rowKinds;
  const weekStart = new Date(now - 6 * 86400000).toISOString().slice(0, 10);

  const serves = seenRes.count ?? 0;
  const generated = exact ? sum(exact.pool.map((p) => p.generated)) : gen.length;
  const servedTasks = exact ? sum(exact.pool.map((p) => p.servedTasks)) : gen.filter((g) => g.served_count > 0).length;
  const generationAttempts = byKind.generate?.calls ?? 0;
  const genCost = (byKind.generate?.cost ?? 0) + (byKind.validate?.cost ?? 0);
  const types = exact ? exact.pool.map((p) => p.type) : [...new Set(gen.map((g) => g.task_type))];
  const typeRow = (t: string) => {
    const e = exact?.pool.find((p) => p.type === t);
    if (exact) return { generated: e?.generated ?? 0, ready: e?.ready ?? 0, serves: e?.serves ?? 0, easy: e?.easy ?? 0, variants: e?.variants ?? 0 };
    const mine = gen.filter((g) => g.task_type === t);
    const current = mine.filter((g) => Number(g.v ?? 1) >= GENERATOR_VERSION);
    return {
      generated: mine.length,
      ready: current.length,
      serves: sum(mine.map((g) => g.served_count)),
      easy: current.filter((g) => g.easy === true).length,
      variants: current.filter((g) => Boolean(g.variantOf)).length,
    };
  };

  return {
    migrationMissing,
    plansReady: profiles.some((p) => "plan" in p) || (!profiles.length && invites.some((i) => "plan" in i)),
    push: {
      configured: Boolean(vapidEnv()),
      available: !pushRes.error,
      slotsReady,
      devices: pushRows.length,
      lastSlot: pushRows.reduce<string | null>((m, r) => (r.reminded_slot && (!m || r.reminded_slot > m) ? r.reminded_slot : m), null),
    },
    totals: {
      users: authUsers.length,
      blocked: profiles.filter((p) => p.blocked).length,
      pro: profiles.filter((p) => effectivePlan(p) === "pro").length,
      onlineNow: profiles.filter((p) => p.last_seen_at && now - new Date(p.last_seen_at).getTime() < 5 * 60000).length,
      activeToday: new Set([...days.filter((d) => d.day === today).map((d) => d.user_id), ...traffic.filter((t) => t.day === today).map((t) => t.user_id)]).size,
      activeWeek: new Set([...days.filter((d) => d.day >= week[0]).map((d) => d.user_id), ...traffic.map((t) => t.user_id)]).size,
      hours: sum(days.map((d) => d.seconds)) / 3600,
      tasksSolved: sum(days.map((d) => d.tasks)),
      testsCompleted: attempts.length,
    },
    cost: exact
      ? { total: exact.totals.all, today: exact.totals.today, week: exact.totals.d7, byKind }
      : {
          total: sum(ai.map((a) => Number(a.cost_usd))),
          today: sum(ai.filter((a) => (a.created_at ?? "").slice(0, 10) === today).map((a) => Number(a.cost_usd))),
          week: sum(ai.filter((a) => (a.created_at ?? "").slice(0, 10) >= weekStart).map((a) => Number(a.cost_usd))),
          byKind,
        },
    pool: {
      generated,
      generationAttempts,
      acceptRate: generationAttempts ? generated / generationAttempts : null,
      serves,
      servedTasks,
      recycledServes: Math.max(0, serves - servedTasks),
      sharedTasks: exact ? sum(exact.pool.map((p) => p.sharedTasks)) : gen.filter((g) => g.served_count >= 2).length,
      waiting: exact ? sum(exact.pool.map((p) => p.neverServed)) : gen.filter((g) => g.served_count === 0).length,
      reuseFactor: servedTasks ? serves / servedTasks : null,
      costPerServe: serves ? genCost / serves : null,
      byType: enabledTypes
        .concat(types.filter((t) => !TASK_TYPES.some((m) => m.id === t)))
        .map((t) => ({ type: t, ...typeRow(t), stock: stock ? (stock.get(t)?.stock ?? 0) : null })),
    },
    costByType: exact
      ? exact.optimization.types
          .filter((t) => enabledTypes.includes(t.type))
          .map((t) => ({
            type: t.type,
            accepted: t.accepted,
            first: t.first,
            revised: t.revised,
            easy: t.easyAccepted,
            variants: t.variantsAccepted,
            rejected: t.rejectedAttempts,
            generateCost: t.generateCost,
            validateCost: t.validateCost,
            otherCost: t.otherCost,
            perTask: t.perTask,
            thinkingShare: t.thinkingShare,
            batchShare: t.batchShare,
            cacheShare: t.cacheShare,
          }))
      : costRes.error
        ? null
        : typeCosts((costRes.data ?? []) as CostRow[], enabledTypes),
    optimization: exact?.optimization ?? null,
    traffic: week.map((day) => ({
      day,
      users: new Set([...traffic.filter((t) => t.day === day).map((t) => t.user_id), ...days.filter((d) => d.day === day && d.seconds > 0).map((d) => d.user_id)]).size,
      views: sum(traffic.filter((t) => t.day === day).map((t) => t.views)),
      minutes: Math.round(sum(days.filter((d) => d.day === day).map((d) => d.seconds)) / 60),
    })),
    rejects: ((rejectsRes.error ? [] : rejectsRes.data) ?? [])
      .filter((r) => r.note)
      .map((r) => ({ at: r.created_at as string, note: r.note as string })),
    autogen: {
      available: Boolean(autoState),
      enabled: Boolean(autoState?.enabled),
      workers: Number(autoState?.workers ?? 2),
      mode: autoState && "mode" in autoState ? ((autoState.mode as "sync" | "batch") ?? "sync") : null,
      batch,
      exams: autoExams,
      stockTarget,
      stockFull,
      busy: ((leasesRes.error ? [] : leasesRes.data) ?? []).filter((l) => new Date(l.lease_until as string).getTime() > now).length,
      lastTickAt: (autoState?.last_tick_at as string | null) ?? null,
      cronAlive: Boolean(autoState?.last_tick_at && now - new Date(autoState.last_tick_at as string).getTime() < 150_000),
      creditsExhaustedAt: (autoState?.credits_exhausted_at as string | null) ?? null,
      lastError: (autoState?.last_error as string | null) ?? null,
      startedAt: autoStart,
      generatedSinceStart: exact?.sinceStart
        ? exact.sinceStart.generated
        : autoStart
          ? gen.filter((g) => !g.created_by && (g as { created_at?: string }).created_at && (g as { created_at?: string }).created_at! >= autoStart).length
          : 0,
      costSinceStart: exact?.sinceStart
        ? exact.sinceStart.cost
        : autoStart
          ? sum(ai.filter((a) => !a.user_id && (a.created_at ?? "") >= autoStart).map((a) => Number(a.cost_usd)))
          : 0,
      secret: process.env.AUTOGEN_SECRET ?? null,
    },
    config: {
      generator: `${AI.model} (${AI.firstEffort}${AI.revisionEffort !== AI.firstEffort ? `, oprava ${AI.revisionEffort}` : ""})`,
      ...(Object.keys(AI.modelByType).length
        ? { generatorByType: Object.entries(AI.modelByType).map(([t, m]) => `${t}=${m}`).join(" ") }
        : {}),
      variants: `${AI.variantModel} (${AI.variantEffort})`,
      words: AI.wordsModel,
      validator: `${AI.validatorModel} (${AI.validatorEffort})`,
      explain: `${AI.explainModel} · AI úlohy ${AI.explainGeneratedModel}`,
      chat: AI.chatModel,
      generatorVersion: GENERATOR_VERSION,
      dailyGenerateLimit: AI.dailyGenerateLimit,
      autogen:
        `zkoušky ${autoExams === undefined ? "všechny (bez migrace 0017)" : (autoExams ?? EXAMS.filter((e) => e.enabled).map((e) => e.id)).join(" + ").toUpperCase()} · ` +
        `cílová zásoba ${stockTarget === null ? "– (bez migrace 0017)" : stockTarget ? `${stockTarget} neviděných úloh na typ pro nejaktivnějšího uživatele${stockFull ? " – plná, generování čeká" : ""}` : "bez stropu"}`,
      rules:
        `${DECKS} sady vzorů na typ (střídání po hodině) · lehké ≤ ${EASY_SHARE * 100} % zásoby a ≤ 1 z ${EASY_WINDOW} úloh uživatele · ` +
        `varianty (${VARIANT_TYPES.join(", ")}) ≤ ${VARIANT_SHARE * 100} % zásoby, rodina ≤ ${FAMILY_MAX}, další člen po ${FAMILY_GAP_TASKS} úlohách + ${FAMILY_GAP_DAYS} dnech · ` +
        `batch ${JOBS_PER_WORKER} rozpracovaných na worker, po ${PER_TYPE} od typu`,
    },
    learning: TASK_TYPES.filter((m) => EXAMS.some((e) => e.id === m.exam && e.enabled)).map((m) => {
      const mine = outcomes.filter((o) => o.note?.startsWith(`${m.id}:`));
      const lesson = lessonRows.find((l) => l.task_type === m.id);
      const exactRow = exact?.learning.get(m.id);
      if (exactRow) return { type: m.id, ...exactRow, lessons: lesson?.lessons ?? null, lessonsAt: lesson?.updated_at ?? null };
      return {
        type: m.id,
        // easy tasks passed only the lower bar – they count as discarded here (the cost panel lists them)
        first: mine.filter((o) => o.kind === "accept" && /: first\b/.test(o.note ?? "") && !/\beasy$/.test(o.note ?? "")).length,
        revised: mine.filter((o) => o.kind === "accept" && /: revised\b/.test(o.note ?? "") && !/\beasy$/.test(o.note ?? "")).length,
        failed: mine.filter((o) => o.kind === "reject" && /\[po opravě\]|generátor nevrátil|: chyba:/.test(o.note ?? "")).length,
        lessons: lesson?.lessons ?? null,
        lessonsAt: lesson?.updated_at ?? null,
      };
    }),
    users,
    invites: invites.map((i) => ({
      code: i.code,
      note: i.note,
      createdAt: i.created_at,
      usedAt: i.used_at,
      usedBy: i.used_by,
      usedByEmail: i.used_by ? emailOf.get(i.used_by) ?? null : null,
      revoked: i.revoked,
      plan: i.plan === "basic" || i.plan === "pro" ? i.plan : null,
      durationDays: i.duration_days ?? null,
    })),
  };
}
