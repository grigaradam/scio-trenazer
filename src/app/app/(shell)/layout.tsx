import { redirect } from "next/navigation";
import { BottomNav, SideNav } from "@/components/AppNav";
import { InstallBanner } from "@/components/InstallBanner";
import { Logo } from "@/components/Logo";
import { Notifications } from "@/components/Notifications";
import { PageTracker } from "@/components/PageTracker";
import { PetNudge } from "@/components/PetNudge";
import { StatPills } from "@/components/StatPills";
import { levelInfo } from "@/lib/gamification";
import { petStage, petState } from "@/lib/pet";
import { effectivePlan } from "@/lib/plans";
import { getProfile, requireUser } from "@/lib/server/auth";
import { getPetInput } from "@/lib/server/pet";
import { czToday } from "@/lib/server/queries";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const profile = await getProfile(user.id);
  if (!profile.onboarded) redirect("/app/onboarding");

  const admin = createAdminClient();
  const today = czToday();
  const [pet, { count: openMistakes }] = await Promise.all([
    getPetInput(user.id, profile),
    admin.from("mistakes").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "open"),
  ]);
  const petNow = petState(pet.input, profile.test_override?.pet ?? null);

  const stats = {
    xp: profile.xp,
    streak: profile.streak_current,
    activeToday: profile.last_active_date === today,
    todaySeconds: pet.todaySeconds,
    goalMin: profile.daily_goal_min,
  };

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r-2 border-border px-4 py-6 lg:flex">
        <div className="px-2">
          <Logo small />
        </div>
        <SideNav badge={openMistakes ?? 0} avatar={profile.avatar_url} plan={effectivePlan(profile)} petHungry={profile.last_active_date !== today} />
        <div className="mt-auto">
          <StatPills {...stats} layout="card" />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b-2 border-border bg-bg/90 px-4 py-2.5 backdrop-blur lg:hidden">
          <Logo small />
          <StatPills {...stats} />
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-[calc(var(--dock-top)+2.5rem)] pt-6 lg:px-8 lg:pb-12 lg:pt-8">
          <InstallBanner />
          {children}
        </main>
      </div>
      <BottomNav badge={openMistakes ?? 0} avatar={profile.avatar_url} petHungry={profile.last_active_date !== today} />
      <PageTracker />
      <Notifications />
      <PetNudge
        userId={user.id}
        day={today}
        stage={petStage(levelInfo(profile.xp).level).stage.code}
        state={petNow}
        fedToday={pet.input.todayTasks > 0}
      />
    </div>
  );
}
