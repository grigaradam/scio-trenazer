import "server-only";
import type { PetInput } from "@/lib/pet";
import { czToday, getAchievements, getStudyDays } from "./queries";
import type { Profile } from "./types";

/** Whole days between two Prague dates ("2026-10-31"). */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);

/** Everything the pet is derived from, for the pet page and the app shell. */
export async function getPetInput(userId: string, profile: Pick<Profile, "xp" | "last_active_date" | "streak_current" | "daily_goal_min">) {
  const [days, achievements] = await Promise.all([getStudyDays(userId, 7), getAchievements(userId)]);
  const today = czToday();
  const todayRow = days.find((d) => d.day === today);
  const idleDays = profile.last_active_date ? daysBetween(profile.last_active_date, today) : null;
  const weekAgo = Date.parse(today) - 6 * 86400000; // today and the 6 days before
  const input: PetInput = {
    xp: profile.xp,
    // the stored streak only resets on the next solved task; a gap of 2+ days already broke it
    streak: idleDays !== null && idleDays <= 1 ? profile.streak_current : 0,
    idleDays,
    todayTasks: todayRow?.tasks ?? 0,
    todayMinutes: Math.floor((todayRow?.seconds ?? 0) / 60),
    goalMinutes: profile.daily_goal_min,
    recentAchievements: achievements.filter((a) => Date.parse(a.unlocked_at) >= weekAgo).length,
  };
  return { input, achievements, todaySeconds: todayRow?.seconds ?? 0 };
}
