import "server-only";
import { GENERATOR_VERSION } from "@/lib/ai/generate";
import { TASK_TYPES } from "@/lib/content/exams";
import { AI } from "@/lib/env";
import { levelInfo } from "@/lib/gamification";
import { createAdminClient } from "@/lib/supabase/admin";
import { czToday } from "./queries";
import type { Profile } from "./types";

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
}

export interface InviteRow {
  code: string;
  note: string | null;
  createdAt: string;
  usedAt: string | null;
  usedBy: string | null;
  usedByEmail: string | null;
  revoked: boolean;
}

export interface AdminStats {
  migrationMissing: boolean;
  totals: {
    users: number;
    blocked: number;
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
    byType: { type: string; generated: number; ready: number; serves: number }[];
  };
  traffic: { day: string; users: number; views: number; minutes: number }[];
  rejects: { at: string; note: string }[];
  config: Record<string, string | number>;
  learning: { type: string; first: number; revised: number; failed: number; lessons: string | null; lessonsAt: string | null }[];
  users: AdminUserRow[];
  invites: InviteRow[];
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function daysBack(n: number) {
  const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" });
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => fmt.format(new Date(now - (n - 1 - i) * 86400000)));
}

export async function loadAdminStats(): Promise<AdminStats> {
  const admin = createAdminClient();
  const week = daysBack(7);
  const [usersRes, profilesRes, daysRes, genRes, seenRes, aiRes, attemptsRes, invitesRes, trafficRes] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from("profiles").select("*"),
    admin.from("study_days").select("user_id,day,seconds,tasks"),
    admin.from("generated_tasks").select("id,created_by,served_count,task_type,v:payload->v"),
    admin.from("task_seen").select("task_ref", { count: "exact", head: true }).like("task_ref", "gen:%"),
    admin.from("ai_calls").select("user_id,kind,cost_usd,created_at,ok"),
    admin.from("attempts").select("user_id").eq("status", "completed"),
    admin.from("invite_codes").select("*").order("created_at", { ascending: false }),
    admin.from("daily_traffic").select("day,user_id,views").gte("day", week[0]),
  ]);
  const migrationMissing = Boolean(aiRes.error || invitesRes.error || trafficRes.error);
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const [outcomesRes, lessonsRes] = await Promise.all([
    admin.from("ai_calls").select("kind,note").in("kind", ["accept", "reject"]).gte("created_at", since).limit(5000),
    admin.from("generator_lessons").select("task_type,lessons,updated_at"),
  ]);
  const outcomes = (outcomesRes.error ? [] : (outcomesRes.data ?? [])) as { kind: string; note: string | null }[];
  const lessonRows = (lessonsRes.error ? [] : (lessonsRes.data ?? [])) as { task_type: string; lessons: string; updated_at: string }[];
  const rejectsRes = await admin
    .from("ai_calls")
    .select("created_at,note")
    .eq("kind", "reject")
    .order("created_at", { ascending: false })
    .limit(40);

  const authUsers = usersRes.data?.users ?? [];
  const profiles = (profilesRes.data ?? []) as Profile[];
  const days = (daysRes.data ?? []) as { user_id: string; day: string; seconds: number; tasks: number }[];
  const gen = (genRes.data ?? []) as { id: string; created_by: string | null; served_count: number; task_type: string; v?: number | null }[];
  const ai = (aiRes.data ?? []) as { user_id: string | null; kind: string; cost_usd: number; created_at: string; ok: boolean }[];
  const attempts = (attemptsRes.data ?? []) as { user_id: string }[];
  const invites = (invitesRes.data ?? []) as {
    code: string;
    note: string | null;
    created_at: string;
    used_at: string | null;
    used_by: string | null;
    revoked: boolean;
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
      generated: gen.filter((g) => g.created_by === u.id).length,
      aiCalls: myAi.length,
      costUsd: sum(myAi.map((a) => Number(a.cost_usd))),
      blocked: Boolean(p?.blocked),
      inviteCode: p?.invite_code ?? null,
    };
  });
  users.sort((a, b) => (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? ""));

  const byKind: Record<string, { calls: number; cost: number }> = {};
  for (const a of ai) {
    const k = (byKind[a.kind] ??= { calls: 0, cost: 0 });
    k.calls++;
    k.cost += Number(a.cost_usd);
  }
  const weekStart = new Date(now - 6 * 86400000).toISOString().slice(0, 10);

  const serves = seenRes.count ?? 0;
  const servedTasks = gen.filter((g) => g.served_count > 0).length;
  const generationAttempts = ai.filter((a) => a.kind === "generate").length;
  const genCost = (byKind.generate?.cost ?? 0) + (byKind.validate?.cost ?? 0);
  const types = [...new Set(gen.map((g) => g.task_type))];

  return {
    migrationMissing,
    totals: {
      users: authUsers.length,
      blocked: profiles.filter((p) => p.blocked).length,
      onlineNow: profiles.filter((p) => p.last_seen_at && now - new Date(p.last_seen_at).getTime() < 5 * 60000).length,
      activeToday: new Set([...days.filter((d) => d.day === today).map((d) => d.user_id), ...traffic.filter((t) => t.day === today).map((t) => t.user_id)]).size,
      activeWeek: new Set([...days.filter((d) => d.day >= week[0]).map((d) => d.user_id), ...traffic.map((t) => t.user_id)]).size,
      hours: sum(days.map((d) => d.seconds)) / 3600,
      tasksSolved: sum(days.map((d) => d.tasks)),
      testsCompleted: attempts.length,
    },
    cost: {
      total: sum(ai.map((a) => Number(a.cost_usd))),
      today: sum(ai.filter((a) => (a.created_at ?? "").slice(0, 10) === today).map((a) => Number(a.cost_usd))),
      week: sum(ai.filter((a) => (a.created_at ?? "").slice(0, 10) >= weekStart).map((a) => Number(a.cost_usd))),
      byKind,
    },
    pool: {
      generated: gen.length,
      generationAttempts,
      acceptRate: generationAttempts ? gen.length / generationAttempts : null,
      serves,
      servedTasks,
      recycledServes: Math.max(0, serves - servedTasks),
      sharedTasks: gen.filter((g) => g.served_count >= 2).length,
      waiting: gen.filter((g) => g.served_count === 0).length,
      reuseFactor: servedTasks ? serves / servedTasks : null,
      costPerServe: serves ? genCost / serves : null,
      byType: TASK_TYPES.filter((t) => t.exam === "osp")
        .map((m) => m.id as string)
        .concat(types.filter((t) => !TASK_TYPES.some((m) => m.id === t)))
        .map((t) => ({
          type: t,
          generated: gen.filter((g) => g.task_type === t).length,
          ready: gen.filter((g) => g.task_type === t && Number(g.v ?? 1) >= GENERATOR_VERSION).length,
          serves: sum(gen.filter((g) => g.task_type === t).map((g) => g.served_count)),
        }))

    },
    traffic: week.map((day) => ({
      day,
      users: new Set([...traffic.filter((t) => t.day === day).map((t) => t.user_id), ...days.filter((d) => d.day === day && d.seconds > 0).map((d) => d.user_id)]).size,
      views: sum(traffic.filter((t) => t.day === day).map((t) => t.views)),
      minutes: Math.round(sum(days.filter((d) => d.day === day).map((d) => d.seconds)) / 60),
    })),
    rejects: ((rejectsRes.error ? [] : rejectsRes.data) ?? [])
      .filter((r) => r.note)
      .map((r) => ({ at: r.created_at as string, note: r.note as string })),
    config: {
      generator: `${AI.model} (${AI.generatorEffort})`,
      validator: `${AI.validatorModel} (${AI.validatorEffort})`,
      explain: AI.explainModel,
      chat: AI.chatModel,
      generatorVersion: GENERATOR_VERSION,
      dailyGenerateLimit: AI.dailyGenerateLimit,
    },
    learning: TASK_TYPES.filter((m) => m.exam === "osp").map((m) => {
      const mine = outcomes.filter((o) => o.note?.startsWith(`${m.id}:`));
      const lesson = lessonRows.find((l) => l.task_type === m.id);
      return {
        type: m.id,
        first: mine.filter((o) => o.kind === "accept" && o.note?.endsWith("first")).length,
        revised: mine.filter((o) => o.kind === "accept" && o.note?.endsWith("revised")).length,
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
    })),
  };
}
