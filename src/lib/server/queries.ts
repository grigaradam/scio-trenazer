import "server-only";
import { TASK_TYPES } from "@/lib/content/exams";
import { getTests } from "@/lib/content/load";
import type { TaskType } from "@/lib/content/types";
import type { Bucket } from "@/lib/scoring";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AttemptRow, MistakeRow, StudyDay } from "./types";

export const czToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(new Date());

export async function getAttempts(userId: string) {
  const { data } = await createAdminClient()
    .from("attempts")
    .select("*")
    .eq("user_id", userId)
    .order("started_at", { ascending: false });
  return (data ?? []) as AttemptRow[];
}

export async function getAttempt(userId: string, id: string) {
  const { data } = await createAdminClient().from("attempts").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  return (data as AttemptRow) ?? null;
}

export async function getMistakes(userId: string) {
  const { data } = await createAdminClient()
    .from("mistakes")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  return (data ?? []) as MistakeRow[];
}

export async function getStudyDays(userId: string, days = 371) {
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data } = await createAdminClient()
    .from("study_days")
    .select("day,seconds,tasks,correct,xp")
    .eq("user_id", userId)
    .gte("day", from)
    .order("day");
  return (data ?? []) as StudyDay[];
}

export async function getAchievements(userId: string) {
  const { data } = await createAdminClient().from("achievements").select("code,unlocked_at").eq("user_id", userId);
  return (data ?? []) as { code: string; unlocked_at: string }[];
}

export interface TypeStat {
  type: TaskType;
  /** accuracy across tests + practice, 0..1, null = no data */
  accuracy: number | null;
  attempts: number;
  openMistakes: number;
  practiceCount: number;
}

/** Per task type: accuracy from completed tests and practice answers, plus open mistakes. */
export async function getTypeStats(userId: string, attempts?: AttemptRow[], mistakes?: MistakeRow[]): Promise<TypeStat[]> {
  attempts ??= await getAttempts(userId);
  mistakes ??= await getMistakes(userId);
  const { data: practice } = await createAdminClient()
    .from("practice_answers")
    .select("task_type,correct")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(3000);

  const acc: Record<string, { right: number; total: number; practice: number }> = {};
  for (const a of attempts) {
    if (a.status !== "completed" || !a.result) continue;
    for (const [type, b] of Object.entries(a.result.types) as [string, Bucket][]) {
      const s = (acc[type] ??= { right: 0, total: 0, practice: 0 });
      s.right += b.correct + b.partial * 0.5;
      s.total += b.max;
    }
  }
  for (const p of practice ?? []) {
    const s = (acc[p.task_type] ??= { right: 0, total: 0, practice: 0 });
    s.right += p.correct ? 1 : 0;
    s.total += 1;
    s.practice += 1;
  }
  return TASK_TYPES.filter((t) => t.exam === "osp").map((t) => ({
    type: t.id,
    accuracy: acc[t.id]?.total ? acc[t.id].right / acc[t.id].total : null,
    attempts: acc[t.id]?.total ?? 0,
    practiceCount: acc[t.id]?.practice ?? 0,
    openMistakes: mistakes!.filter((m) => m.task_type === t.id && m.status === "open").length,
  }));
}

/** Compares the last two completed tests per task type. */
export function compareLastTests(attempts: AttemptRow[]) {
  const done = attempts.filter((a) => a.status === "completed" && a.result).sort((a, b) => (a.completed_at! < b.completed_at! ? 1 : -1));
  if (done.length < 2) return null;
  const [cur, prev] = done;
  const rows = TASK_TYPES.filter((t) => t.exam === "osp").map((t) => {
    const c = cur.result!.types[t.id];
    const p = prev.result!.types[t.id];
    const pc = c && c.max ? c.score / c.max : null;
    const pp = p && p.max ? p.score / p.max : null;
    return { type: t.id, now: pc, before: pp, delta: pc !== null && pp !== null ? pc - pp : null };
  });
  return { current: cur, previous: prev, rows };
}

export function testTitle(id: string) {
  return getTests("osp").find((t) => t.id === id)?.title ?? id;
}
