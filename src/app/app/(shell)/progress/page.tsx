import { Heatmap, ScoreChart, type ScorePoint } from "@/components/ProgressCharts";
import { Card, ProgressBar, SectionTitle } from "@/components/ui";
import { SECTION_META, taskTypeMeta } from "@/lib/content/exams";
import { ACHIEVEMENTS } from "@/lib/gamification";
import { getProfile, requireUser } from "@/lib/server/auth";
import { getAchievements, getAttempts, getMistakes, getStudyDays, getTypeStats, testTitle } from "@/lib/server/queries";

export const metadata = { title: "Pokrok" };

export default async function ProgressPage() {
  const { user } = await requireUser();
  const [profile, attempts, mistakes, days, achievements] = await Promise.all([
    getProfile(user.id),
    getAttempts(user.id),
    getMistakes(user.id),
    getStudyDays(user.id, 200),
    getAchievements(user.id),
  ]);
  const typeStats = await getTypeStats(user.id, attempts, mistakes);

  const completed = attempts.filter((a) => a.status === "completed" && a.result).reverse();
  const points: ScorePoint[] = completed.map((a) => ({
    date: new Date(a.completed_at!).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" }),
    label: testTitle(a.test_id),
    percent: a.result!.percent,
    percentile: a.result!.percentile,
    verbal: Math.max(0, Math.round((a.result!.sections.verbal.score / a.result!.sections.verbal.max) * 100)),
    analytic: Math.max(0, Math.round((a.result!.sections.analytic.score / a.result!.sections.analytic.max) * 100)),
  }));

  const totalSec = days.reduce((s, d) => s + d.seconds, 0);
  const totalTasks = days.reduce((s, d) => s + d.tasks, 0);
  const totalCorrect = days.reduce((s, d) => s + d.correct, 0);
  const dayMap = Object.fromEntries(days.map((d) => [d.day, { min: Math.round(d.seconds / 60), tasks: d.tasks }]));
  const recent = [...days].reverse().slice(0, 14);
  const unlocked = new Map(achievements.map((a) => [a.code, a.unlocked_at]));

  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-extrabold">Pokrok</h1>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["⏱️", `${Math.floor(totalSec / 3600)} h ${Math.round((totalSec % 3600) / 60)} min`, "celkem učení"],
          ["✅", String(totalTasks), "vyřešených úloh"],
          ["🎯", totalTasks ? `${Math.round((totalCorrect / totalTasks) * 100)} %` : "–", "úspěšnost"],
          ["📝", String(completed.length), "dokončených testů"],
        ].map(([e, v, l]) => (
          <Card key={l} className="p-4">
            <div className="text-2xl">{e}</div>
            <div className="mt-1 font-display text-2xl font-extrabold">{v}</div>
            <div className="text-xs font-bold uppercase text-muted">{l}</div>
          </Card>
        ))}
      </section>

      <section>
        <SectionTitle>Čas učení po dnech</SectionTitle>
        <Card>
          <Heatmap days={dayMap} goalMin={profile.daily_goal_min} />
        </Card>
      </section>

      <section>
        <SectionTitle>Výsledky testů</SectionTitle>
        <Card>
          <ScoreChart data={points} />
        </Card>
      </section>

      <section>
        <SectionTitle>Zvládnutí typů úloh</SectionTitle>
        <div className="grid gap-6 md:grid-cols-2">
          {(["verbal", "analytic"] as const).map((sec) => (
            <Card key={sec}>
              <div className={`mb-3 text-xs font-extrabold uppercase tracking-wider ${sec === "verbal" ? "text-verbal-600" : "text-analytic-600"}`}>
                {SECTION_META[sec].title}
              </div>
              <div className="space-y-3">
                {typeStats
                  .filter((t) => taskTypeMeta(t.type)?.section === sec)
                  .map((t) => {
                    const meta = taskTypeMeta(t.type)!;
                    const pct = t.accuracy ?? 0;
                    return (
                      <div key={t.type}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="font-semibold">
                            {meta.emoji} {meta.name}
                          </span>
                          <span className="font-bold text-muted">{t.accuracy !== null ? `${Math.round(pct * 100)} %` : "–"}</span>
                        </div>
                        <ProgressBar
                          value={pct}
                          className="h-2.5"
                          barClassName={pct >= 0.7 ? "bg-emerald-500" : pct >= 0.4 ? "bg-amber-400" : "bg-rose-500"}
                        />
                      </div>
                    );
                  })}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {recent.length > 0 && (
        <section>
          <SectionTitle>Posledních 14 dní</SectionTitle>
          <div className="overflow-hidden rounded-3xl border-2 border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-2">Den</th>
                  <th className="px-4 py-2 text-right">Čas</th>
                  <th className="px-4 py-2 text-right">Úlohy</th>
                  <th className="px-4 py-2 text-right">Správně</th>
                  <th className="hidden px-4 py-2 text-right sm:table-cell">XP</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((d) => (
                  <tr key={d.day} className="border-t-2 border-border">
                    <td className="px-4 py-2 font-semibold">
                      {new Date(d.day).toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" })}
                      {d.seconds >= profile.daily_goal_min * 60 && " ✅"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{Math.round(d.seconds / 60)} min</td>
                    <td className="px-4 py-2 text-right tabular-nums">{d.tasks}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{d.tasks ? `${Math.round((d.correct / d.tasks) * 100)} %` : "–"}</td>
                    <td className="hidden px-4 py-2 text-right tabular-nums sm:table-cell">{d.xp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <SectionTitle>
          Achievementy · {unlocked.size}/{ACHIEVEMENTS.length}
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {ACHIEVEMENTS.map((a) => {
            const at = unlocked.get(a.code);
            return (
              <div
                key={a.code}
                className={`rounded-3xl border-2 p-4 text-center ${at ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20" : "border-border bg-surface opacity-60"}`}
              >
                <div className={`text-3xl ${at ? "" : "grayscale"}`}>{at ? a.emoji : "🔒"}</div>
                <div className="mt-1 text-sm font-extrabold">{a.title}</div>
                <div className="text-xs text-muted">{a.description}</div>
                {at && <div className="mt-1 text-[11px] font-bold text-amber-700 dark:text-amber-300">{new Date(at).toLocaleDateString("cs-CZ")}</div>}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
