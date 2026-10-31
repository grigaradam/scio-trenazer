import { PetView } from "@/components/PetView";
import { getProfile, requireUser } from "@/lib/server/auth";
import { czToday, getAchievements, getStudyDays } from "@/lib/server/queries";

export const metadata = { title: "Mazlíček" };

export default async function PetPage() {
  const { user } = await requireUser();
  const [profile, days, achievements] = await Promise.all([getProfile(user.id), getStudyDays(user.id, 7), getAchievements(user.id)]);
  const today = czToday();
  const todayRow = days.find((d) => d.day === today);
  const idleDays = profile.last_active_date
    ? Math.round((Date.parse(today) - Date.parse(profile.last_active_date)) / 86400000)
    : null;
  const weekAgo = Date.parse(today) - 6 * 86400000; // today and the 6 days before

  return (
    <PetView
      userId={user.id}
      xp={profile.xp}
      input={{
        xp: profile.xp,
        // the stored streak only resets on the next solved task; a gap of 2+ days already broke it
        streak: idleDays !== null && idleDays <= 1 ? profile.streak_current : 0,
        idleDays,
        todayTasks: todayRow?.tasks ?? 0,
        todayMinutes: Math.floor((todayRow?.seconds ?? 0) / 60),
        goalMinutes: profile.daily_goal_min,
        recentAchievements: achievements.filter((a) => Date.parse(a.unlocked_at) >= weekAgo).length,
      }}
      unlocked={achievements.map((a) => a.code)}
      override={profile.test_override?.pet ?? null}
    />
  );
}
