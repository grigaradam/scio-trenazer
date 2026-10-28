import { redirect } from "next/navigation";
import { BottomNav, SideNav } from "@/components/AppNav";
import { InstallBanner } from "@/components/InstallBanner";
import { Logo } from "@/components/Logo";
import { PageTracker } from "@/components/PageTracker";
import { StatPills } from "@/components/StatPills";
import { getProfile, requireUser } from "@/lib/server/auth";
import { czToday } from "@/lib/server/queries";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const profile = await getProfile(user.id);
  if (!profile.onboarded) redirect("/app/onboarding");

  const admin = createAdminClient();
  const today = czToday();
  const [{ data: day }, { count: openMistakes }] = await Promise.all([
    admin.from("study_days").select("seconds").eq("user_id", user.id).eq("day", today).maybeSingle(),
    admin.from("mistakes").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "open"),
  ]);

  const pills = (
    <StatPills
      xp={profile.xp}
      streak={profile.streak_current}
      activeToday={profile.last_active_date === today}
      todaySeconds={day?.seconds ?? 0}
      goalMin={profile.daily_goal_min}
    />
  );

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r-2 border-border px-4 py-6 lg:flex">
        <div className="px-2">
          <Logo small />
        </div>
        <SideNav badge={openMistakes ?? 0} avatar={profile.avatar_url} />
        <div className="mt-auto px-2">{pills}</div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b-2 border-border bg-bg/90 px-4 py-2.5 backdrop-blur lg:hidden">
          <Logo small />
          {pills}
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-6 lg:px-8 lg:pb-12 lg:pt-8">
          <InstallBanner />
          {children}
        </main>
      </div>
      <BottomNav badge={openMistakes ?? 0} avatar={profile.avatar_url} />
      <PageTracker />
    </div>
  );
}
