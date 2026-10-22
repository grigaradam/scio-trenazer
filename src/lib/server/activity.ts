import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACHIEVEMENTS, type AchievementStats } from "@/lib/gamification";
import type { Profile } from "./types";

export async function recordActivity(
  userId: string,
  delta: { seconds?: number; tasks?: number; correct?: number; xp?: number },
): Promise<Profile | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("record_activity", {
    p_user: userId,
    p_seconds: Math.round(delta.seconds ?? 0),
    p_tasks: delta.tasks ?? 0,
    p_correct: delta.correct ?? 0,
    p_xp: Math.round(delta.xp ?? 0),
  });
  if (error) console.error("record_activity", error);
  return (data as Profile) ?? null;
}

/** Evaluates all achievements and stores newly unlocked ones. Returns the new codes. */
export async function checkAchievements(userId: string, extra: Partial<AchievementStats> = {}): Promise<string[]> {
  const admin = createAdminClient();
  const [unlockedQ, attemptsQ, profileQ, practiceQ, fixedQ, daysQ] = await Promise.all([
    admin.from("achievements").select("code").eq("user_id", userId),
    admin.from("attempts").select("score,max_score,result,completed_at").eq("user_id", userId).eq("status", "completed").order("completed_at"),
    admin.from("profiles").select("streak_best").eq("id", userId).single(),
    admin.from("practice_answers").select("task_type,correct").eq("user_id", userId).order("created_at", { ascending: false }).limit(2000),
    admin.from("mistakes").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "fixed"),
    admin.from("study_days").select("seconds").eq("user_id", userId),
  ]);
  const have = new Set((unlockedQ.data ?? []).map((r) => r.code as string));
  const attempts = attemptsQ.data ?? [];
  const practice = practiceQ.data ?? [];

  let row = 0;
  for (const p of practice) {
    if (!p.correct) break;
    row++;
  }
  const percents = attempts.map((a) => (a.max_score ? Number(a.score) / Number(a.max_score) : 0));
  const stats: AchievementStats = {
    testsCompleted: attempts.length,
    bestPercent: Math.max(0, ...percents.map((p) => p * 100)),
    bestPercentile: Math.max(0, ...attempts.map((a) => a.result?.percentile ?? 0)),
    perfectSection: attempts.some((a) =>
      Object.values(a.result?.sections ?? {}).some(
        (b) => (b as { correct: number; max: number }).correct === (b as { max: number }).max && (b as { max: number }).max > 0,
      ),
    ),
    streakBest: profileQ.data?.streak_best ?? 0,
    practiceTotal: practice.length,
    practiceCorrectInRow: row,
    mistakesFixed: fixedQ.count ?? 0,
    totalSeconds: (daysQ.data ?? []).reduce((s, d) => s + (d.seconds as number), 0),
    typesPracticed: new Set(practice.map((p) => p.task_type)).size,
    hour: Number(new Intl.DateTimeFormat("cs-CZ", { hour: "numeric", hour12: false, timeZone: "Europe/Prague" }).format(new Date())),
    improvedTest: percents.length >= 2 && percents[percents.length - 1] > percents[percents.length - 2],
    ...extra,
  };
  const fresh = ACHIEVEMENTS.filter((a) => !have.has(a.code) && a.check(stats)).map((a) => a.code);
  if (fresh.length) {
    await admin.from("achievements").insert(fresh.map((code) => ({ user_id: userId, code })));
  }
  return fresh;
}
