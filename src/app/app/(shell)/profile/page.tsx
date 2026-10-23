import { AvatarUpload } from "@/components/AvatarUpload";
import { ProfileForm } from "@/components/ProfileForm";
import { ThemePicker } from "@/components/ThemePicker";
import { Card, ProgressBar } from "@/components/ui";
import { AI } from "@/lib/env";
import { levelInfo, levelTitle } from "@/lib/gamification";
import { getProfile, requireUser } from "@/lib/server/auth";
import { czToday } from "@/lib/server/queries";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Profil" };

export default async function ProfilePage() {
  const { user } = await requireUser();
  const profile = await getProfile(user.id);
  const { data: usage } = await createAdminClient().from("ai_usage").select("kind,count").eq("user_id", user.id).eq("day", czToday());
  const used = (k: string) => usage?.find((u) => u.kind === k)?.count ?? 0;
  const lvl = levelInfo(profile.xp);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-extrabold">Profil</h1>
      <Card className="flex items-center gap-4">
        <AvatarUpload url={profile.avatar_url ?? null} fallback={(profile.display_name ?? user.email ?? "?").slice(0, 1).toUpperCase()} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-xl font-extrabold">{profile.display_name}</div>
          <div className="truncate text-sm text-muted">{user.email}</div>
          <div className="mt-2 flex items-center gap-2 text-sm font-bold">
            Level {lvl.level} · {levelTitle(lvl.level)}
          </div>
          <ProgressBar value={lvl.progress} className="mt-1 h-2" />
        </div>
      </Card>

      <ProfileForm name={profile.display_name ?? ""} goal={profile.daily_goal_min} />

      <ThemePicker />

      <Card>
        <div className="font-display font-extrabold">AI dnes</div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
          {[
            ["Vysvětlení", used("explain"), AI.dailyExplainLimit],
            ["Chat", used("chat"), AI.dailyChatLimit],
            ["Nové úlohy", used("generate"), AI.dailyGenerateLimit],
          ].map(([l, u, max]) => (
            <div key={l as string} className="rounded-2xl bg-surface-2 p-3">
              <div className="font-display text-lg font-extrabold">
                {u}/{max}
              </div>
              <div className="text-xs text-muted">{l}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          Vysvětlení se ukládají a sdílí, takže už jednou vysvětlená úloha limit nečerpá. {AI.enabled ? "" : "⚠️ AI není nastavená (chybí ANTHROPIC_API_KEY)."}
        </p>
      </Card>

      <form action="/auth/signout" method="post">
        <button className="w-full rounded-2xl border-2 border-border py-3 font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20">
          Odhlásit se
        </button>
      </form>
    </div>
  );
}
