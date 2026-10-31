import clsx from "clsx";
import { Announce } from "@/components/Notifications";
import { Heatmap, ScoreChart, type ScorePoint } from "@/components/ProgressCharts";
import { Card, ProgressBar, SectionTitle } from "@/components/ui";
import { SECTION_META, taskTypeMeta } from "@/lib/content/exams";
import {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENTS,
  LEVEL_TITLES,
  levelEmoji,
  levelInfo,
  levelThreshold,
  levelTitle,
  levelUp,
  XP,
} from "@/lib/gamification";
import { PET_STAGES } from "@/lib/pet";
import { achievementStats, checkAchievements } from "@/lib/server/activity";
import { getProfile, requireUser } from "@/lib/server/auth";
import { getAchievements, getAttempts, getMistakes, getStudyDays, getTypeStats, testTitle } from "@/lib/server/queries";

export const metadata = { title: "Pokrok" };

export default async function ProgressPage() {
  const { user } = await requireUser();
  // catch up on achievements that are already earned but not stored yet (e.g. newly added ones);
  // the time-of-day ones are left for real study sessions
  const caughtUp = await checkAchievements(user.id, { hour: 12 });
  const [profile, attempts, mistakes, days, achievements, { stats }] = await Promise.all([
    getProfile(user.id),
    getAttempts(user.id),
    getMistakes(user.id),
    getStudyDays(user.id, 200),
    getAchievements(user.id),
    achievementStats(user.id, { hour: 12 }),
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
  const achievementXp = ACHIEVEMENTS.filter((a) => unlocked.has(a.code)).reduce((sum, a) => sum + a.xp, 0);
  const lvl = levelInfo(profile.xp);
  const ladder = Array.from({ length: Math.max(LEVEL_TITLES.length, lvl.level + 2) }, (_, i) => i + 1);

  return (
    <div className="space-y-8">
      {caughtUp.codes.length > 0 && (
        <Announce codes={caughtUp.codes} levelUp={caughtUp.profile ? levelUp(caughtUp.profile.xp - caughtUp.xp, caughtUp.profile.xp) : null} />
      )}
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

      <section id="levely" className="scroll-mt-20">
        <SectionTitle>Levely</SectionTitle>
        <Card className="space-y-5">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-brand-600 font-display text-3xl font-extrabold text-white shadow-[0_4px_0_0_var(--color-brand-800)]">
              {lvl.level}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-display text-xl font-extrabold">
                {levelEmoji(lvl.level)} {levelTitle(lvl.level)}
              </div>
              <div className="mb-1.5 text-sm font-bold text-muted">
                {profile.xp - lvl.from} / {lvl.to - lvl.from} XP · ještě {lvl.toNext} XP do levelu {lvl.level + 1}
              </div>
              <ProgressBar value={lvl.progress} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {ladder.map((l) => {
              const reached = l <= lvl.level;
              const pet = PET_STAGES.find((st) => st.level === l && l > 1);
              return (
                <div
                  key={l}
                  className={clsx(
                    "rounded-2xl border-2 px-3 py-2",
                    l === lvl.level
                      ? "border-brand-400 bg-brand-50 dark:border-brand-600 dark:bg-brand-900/30"
                      : reached
                        ? "border-border bg-surface"
                        : "border-dashed border-border bg-surface-2/40",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={clsx(
                        "grid h-7 w-7 shrink-0 place-items-center rounded-lg font-display text-sm font-extrabold",
                        reached ? "bg-brand-600 text-white" : "bg-surface-2 text-muted",
                      )}
                    >
                      {l}
                    </span>
                    <span className={clsx("text-lg", !reached && "opacity-50 grayscale")}>{levelEmoji(l)}</span>
                  </div>
                  <div className={clsx("mt-1 text-sm font-extrabold leading-tight", !reached && "text-muted")}>{levelTitle(l)}</div>
                  <div className="mt-1 text-[11px] font-bold text-muted">
                    {reached ? "✓ " : ""}
                    {levelThreshold(l).toLocaleString("cs-CZ")} XP
                    {!reached && ` · ještě ${(levelThreshold(l) - profile.xp).toLocaleString("cs-CZ")}`}
                  </div>
                  {pet && <div className="mt-0.5 text-[11px] font-bold text-brand-600 dark:text-brand-300">🐾 mazlíček: {pet.title}</div>}
                </div>
              );
            })}
          </div>

          <div>
            <div className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted">Jak získat XP</div>
            <div className="flex flex-wrap gap-2 text-xs font-bold">
              {[
                ["✅", "Správná úloha", `+${XP.practiceCorrect}`],
                ["🛠️", "Opravená chyba", `+${XP.mistakeFixed}`],
                ["⚡", "Rychlá odpověď", `+${XP.fastBonus}`],
                ["🙂", "I špatná odpověď", `+${XP.practiceWrong}`],
                ["📝", "Dokončený test", `+${XP.testCompleted} a ${XP.testPerPoint}/bod`],
                ["🏆", "Achievement", `+${Math.min(...ACHIEVEMENTS.map((a) => a.xp))} až ${Math.max(...ACHIEVEMENTS.map((a) => a.xp))}`],
              ].map(([e, l, v]) => (
                <span key={l} className="rounded-full bg-surface-2 px-3 py-1">
                  {e} {l} <span className="text-brand-600 dark:text-brand-300">{v} XP</span>
                </span>
              ))}
            </div>
          </div>
        </Card>
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

      <section id="achievementy" className="scroll-mt-20">
        <SectionTitle
          action={
            <span className="text-sm font-bold text-amber-700 dark:text-amber-300">
              {achievementXp.toLocaleString("cs-CZ")} XP z achievementů
            </span>
          }
        >
          Achievementy · {unlocked.size}/{ACHIEVEMENTS.length}
        </SectionTitle>
        <ProgressBar value={unlocked.size / ACHIEVEMENTS.length} className="mb-6 h-2.5" barClassName="bg-amber-400" />
        <div className="space-y-7">
          {ACHIEVEMENT_CATEGORIES.map((cat) => {
            const list = ACHIEVEMENTS.filter((a) => a.category === cat.code);
            const done = list.filter((a) => unlocked.has(a.code)).length;
            return (
              <div key={cat.code}>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <h3 className="font-display text-lg font-extrabold">
                    {cat.emoji} {cat.title}{" "}
                    <span className={clsx("text-sm", done === list.length ? "text-amber-600 dark:text-amber-300" : "text-muted")}>
                      {done}/{list.length}
                    </span>
                  </h3>
                  <span className="hidden text-xs text-muted sm:block">{cat.hint}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {list.map((a) => {
                    const at = unlocked.get(a.code);
                    const value = a.value(stats);
                    const yesNo = a.target === 1 && !a.unit;
                    return (
                      <div
                        key={a.code}
                        className={clsx(
                          "relative flex flex-col rounded-3xl border-2 p-4 text-center",
                          at ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20" : "border-border bg-surface",
                        )}
                      >
                        <span
                          className={clsx(
                            "absolute right-2.5 top-2.5 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold",
                            at ? "bg-amber-200 text-amber-800 dark:bg-amber-800/60 dark:text-amber-200" : "bg-surface-2 text-muted",
                          )}
                        >
                          +{a.xp} XP
                        </span>
                        <div className={clsx("text-3xl", !at && "opacity-40 grayscale")}>{a.emoji}</div>
                        <div className="mt-1 text-sm font-extrabold">{a.title}</div>
                        <div className="text-xs text-muted">{a.description}</div>
                        <div className="mt-auto pt-2">
                          {at ? (
                            <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300">✓ {new Date(at).toLocaleDateString("cs-CZ")}</div>
                          ) : yesNo ? (
                            <div className="text-[11px] font-bold text-muted">Ještě ne</div>
                          ) : (
                            <>
                              <ProgressBar value={value / a.target} className="h-1.5" barClassName="bg-amber-400" />
                              <div className="mt-1 text-[11px] font-bold tabular-nums text-muted">
                                {Math.min(value, a.target).toLocaleString("cs-CZ")} / {a.target.toLocaleString("cs-CZ")}
                                {a.unit ? ` ${a.unit}` : ""}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
