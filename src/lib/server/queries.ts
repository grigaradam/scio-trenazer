import "server-only";
import { EXAMS, TASK_TYPES } from "@/lib/content/exams";
import { getTest } from "@/lib/content/load";

const enabledExam = (id: string) => EXAMS.some((e) => e.id === id && e.enabled);
import type { ExamId, TaskType } from "@/lib/content/types";
import { mastery, masteryTrend, type MasteryItem } from "@/lib/mastery";
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
  exam: ExamId;
  /** accuracy across tests + practice, 0..1, null = no data */
  accuracy: number | null;
  /** "zvládnutí" 0..1: recency-weighted, fixed mistakes count half (see lib/mastery), null = no data */
  mastery: number | null;
  /** change of mastery over the last 7 days, null = nothing new */
  trend: number | null;
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
    .select("task_type,task_ref,correct,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(3000);

  const acc: Record<string, { right: number; total: number; practice: number }> = {};
  const items: Record<string, MasteryItem[]> = {};
  const fixedInTest = (attemptId: string, type: string) =>
    mistakes!.filter((m) => m.attempt_id === attemptId && m.task_type === type && m.status === "fixed").length;
  for (const a of attempts) {
    if (a.status !== "completed" || !a.result) continue;
    for (const [type, b] of Object.entries(a.result.types) as [string, Bucket][]) {
      const s = (acc[type] ??= { right: 0, total: 0, practice: 0 });
      s.right += b.correct + b.partial * 0.5;
      s.total += b.max;
      (items[type] ??= []).push({
        at: Date.parse(a.completed_at!),
        n: b.max,
        right: b.correct + b.partial * 0.5 + fixedInTest(a.id, type) * 0.5,
      });
    }
  }
  // newest first: a wrong answer whose task was solved later counts as half right
  const solved = new Set<string>();
  for (const p of practice ?? []) {
    const s = (acc[p.task_type] ??= { right: 0, total: 0, practice: 0 });
    s.right += p.correct ? 1 : 0;
    s.total += 1;
    s.practice += 1;
    (items[p.task_type] ??= []).push({ at: Date.parse(p.created_at), n: 1, right: p.correct ? 1 : solved.has(p.task_ref) ? 0.5 : 0 });
    if (p.correct) solved.add(p.task_ref);
  }
  const now = Date.now();
  return TASK_TYPES.filter((t) => enabledExam(t.exam)).map((t) => ({
    type: t.id,
    exam: t.exam,
    accuracy: acc[t.id]?.total ? acc[t.id].right / acc[t.id].total : null,
    mastery: mastery(items[t.id] ?? []),
    trend: masteryTrend(items[t.id] ?? [], now),
    attempts: acc[t.id]?.total ?? 0,
    practiceCount: acc[t.id]?.practice ?? 0,
    openMistakes: mistakes!.filter((m) => m.task_type === t.id && m.status === "open").length,
  }));
}

/** Compares the last two completed tests per task type. */
export function compareLastTests(attempts: AttemptRow[]) {
  const done = attempts.filter((a) => a.status === "completed" && a.result).sort((a, b) => (a.completed_at! < b.completed_at! ? 1 : -1));
  if (done.length < 2) return null;
  const cur = done[0];
  // compare like with like: the last two tests of the same exam
  const prevSame = done.slice(1).find((a) => a.exam === cur.exam);
  if (!prevSame) return null;
  const rows = TASK_TYPES.filter((t) => t.exam === cur.exam).map((t) => {
    const c = cur.result!.types[t.id];
    const p = prevSame.result!.types[t.id];
    const pc = c && c.max ? c.score / c.max : null;
    const pp = p && p.max ? p.score / p.max : null;
    return { type: t.id, now: pc, before: pp, delta: pc !== null && pp !== null ? pc - pp : null };
  });
  return { current: cur, previous: prevSame, rows };
}

export function testTitle(id: string) {
  return getTest(id)?.title ?? id;
}

/** Midnight of today in Prague as an ISO instant (for created_at filters). */
function czDayStart() {
  const day = czToday();
  const offset =
    new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Prague", timeZoneName: "shortOffset" })
      .formatToParts(new Date(`${day}T12:00:00Z`))
      .find((p) => p.type === "timeZoneName")
      ?.value.match(/[+-]\d+/)?.[0] ?? "+1";
  const h = Number(offset);
  return new Date(`${day}T00:00:00${h < 0 ? "-" : "+"}${String(Math.abs(h)).padStart(2, "0")}:00`).toISOString();
}

/** Practice answers given today – Basic gets BASIC.dailyTasks of them. */
export async function practiceToday(userId: string) {
  const { count } = await createAdminClient()
    .from("practice_answers")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", czDayStart());
  return count ?? 0;
}

/** The one test Basic may do: the first it ever started, or null = it may still pick one. */
export function basicTestId(attempts: Pick<AttemptRow, "test_id" | "started_at">[]) {
  const first = [...attempts].sort((a, b) => a.started_at.localeCompare(b.started_at))[0];
  return first?.test_id ?? null;
}
