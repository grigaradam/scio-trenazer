import { ArrowRight, Flame, Play, Target } from "lucide-react";
import Link from "next/link";
import { StartTestButton } from "@/components/StartTestButton";
import { Badge, ButtonLink, Card, ProgressBar, Ring, SectionTitle } from "@/components/ui";
import { taskTypeMeta } from "@/lib/content/exams";
import { levelInfo, levelTitle } from "@/lib/gamification";
import { count, plural } from "@/lib/czech";
import { getProfile, requireUser } from "@/lib/server/auth";
import { greetingName } from "@/lib/server/names";
import { czToday, getAttempts, getMistakes, getStudyDays, getTypeStats, testTitle } from "@/lib/server/queries";

export const metadata = { title: "Přehled" };

export default async function Dashboard() {
  const { user } = await requireUser();
  const [profile, attempts, mistakes, days] = await Promise.all([
    getProfile(user.id),
    getAttempts(user.id),
    getMistakes(user.id),
    getStudyDays(user.id, 14),
  ]);
  const typeStats = await getTypeStats(user.id, attempts, mistakes);

  const today = czToday();
  const todayRow = days.find((d) => d.day === today);
  const todayMin = Math.round((todayRow?.seconds ?? 0) / 60);
  const goal = Math.min(1, todayMin / profile.daily_goal_min);
  const lvl = levelInfo(profile.xp);
  const inProgress = attempts.find((a) => a.status === "in_progress");
  const completed = attempts.filter((a) => a.status === "completed");
  const last = completed[0];
  const openMistakes = mistakes.filter((m) => m.status === "open");
  const activeToday = profile.last_active_date === today;

  // weakest types: lowest accuracy, ties broken by open mistakes
  const weak = typeStats
    .filter((t) => t.accuracy !== null || t.openMistakes > 0)
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0) || b.openMistakes - a.openMistakes)
    .slice(0, 3);

  const last7 = lastDays(7).map((d) => {
    const key = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(d);
    const row = days.find((x) => x.day === key);
    return {
      key,
      label: new Intl.DateTimeFormat("cs-CZ", { weekday: "short", timeZone: "Europe/Prague" }).format(d),
      min: Math.round((row?.seconds ?? 0) / 60),
      tasks: row?.tasks ?? 0,
    };
  });


  const hour = pragueHour();
  const greeting = hour < 10 ? "Dobré ráno" : hour < 18 ? "Ahoj" : "Dobrý večer";

  return (
    <div className="space-y-8">
      <section className="animate-fade-up">
        <h1 className="font-display text-3xl font-extrabold">
          {greeting}, {greetingName(profile) ?? "studente"}! {activeToday ? "🔥" : "👋"}
        </h1>
        <p className="mt-1 text-muted">
          {activeToday
            ? `Dnes už máš splněno – streak ${count(profile.streak_current, "den", "dny", "dní")}. Přidej ještě něco navíc!`
            : profile.streak_current > 0
              ? `Vyřeš dnes aspoň jednu úlohu, ať neztratíš ${profile.streak_current}denní streak.`
              : "Každý den aspoň chvilka. Pravidelnost je víc než jednorázové šprtání."}
        </p>
      </section>

      {inProgress && (
        <Link
          href={`/app/test/${inProgress.id}`}
          className="flex animate-pop items-center gap-4 rounded-3xl border-2 border-amber-300 bg-amber-50 p-4 shadow-[0_4px_0_0_#fcd34d] transition hover:-translate-y-0.5 dark:border-amber-700 dark:bg-amber-900/20 dark:shadow-none"
        >
          <span className="text-3xl">⏳</span>
          <div className="flex-1">
            <div className="font-display text-lg font-extrabold">Máš rozdělaný test – dokonči ho!</div>
            <div className="text-sm text-muted">
              {testTitle(inProgress.test_id)} · {inProgress.section_index === 0 ? "verbální oddíl" : "analytický oddíl"} · zbývá{" "}
              {Math.round((inProgress.section_index === 0 ? inProgress.time_left.verbal : inProgress.time_left.analytic) / 60)} min
            </div>
          </div>
          <Play className="h-6 w-6 text-amber-600" />
        </Link>
      )}

      {!completed.length && !inProgress && (
        <Card className="flex flex-col items-start gap-3 border-brand-200 bg-gradient-to-br from-brand-50 to-surface sm:flex-row sm:items-center dark:border-brand-800 dark:from-brand-900/30">
          <span className="text-4xl">📝</span>
          <div className="flex-1">
            <div className="font-display text-xl font-extrabold">Začni úvodním testem</div>
            <div className="text-sm text-muted">Celý test OSP na čas. Podle výsledku ti připravíme trénink na míru.</div>
          </div>
          <StartTestButton diagnostic>Spustit úvodní test</StartTestButton>
        </Card>
      )}

      <section className="grid grid-cols-3 gap-2 sm:gap-4">
        <Card className="flex flex-col items-center gap-2 p-3 text-center sm:flex-row sm:gap-4 sm:p-5 sm:text-left">
          <Ring value={goal} size={56} stroke={7} color={goal >= 1 ? "#10b981" : "var(--color-brand-500)"}>
            <span className="text-xs">{goal >= 1 ? "✓" : `${Math.round(goal * 100)}%`}</span>
          </Ring>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted sm:text-xs">Denní cíl</div>
            <div className="font-display text-lg font-extrabold sm:text-2xl">
              {todayMin}
              <span className="text-xs text-muted sm:text-base">/{profile.daily_goal_min} min</span>
            </div>
          </div>
        </Card>
        <Card className="flex flex-col items-center gap-2 p-3 text-center sm:flex-row sm:gap-4 sm:p-5 sm:text-left">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-orange-100 dark:bg-orange-900/30">
            <Flame className={`h-7 w-7 ${activeToday ? "animate-flame text-orange-500" : "text-muted"}`} />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted sm:text-xs">Streak</div>
            <div className="font-display text-lg font-extrabold sm:text-2xl">
              {profile.streak_current} <span className="text-xs text-muted sm:text-base">{plural(profile.streak_current, "den", "dny", "dní")}</span>
            </div>
            <div className="hidden text-xs text-muted sm:block">rekord {profile.streak_best}</div>
          </div>
        </Card>
        <Card className="flex flex-col items-center gap-2 p-3 text-center sm:items-stretch sm:p-5 sm:text-left">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-600 font-display text-2xl font-extrabold text-white sm:hidden">
            {lvl.level}
          </div>
          <div className="hidden items-center justify-between sm:flex">
            <div className="text-xs font-bold uppercase tracking-wider text-muted">Level {lvl.level}</div>
            <Badge tone="brand">{levelTitle(lvl.level)}</Badge>
          </div>
          <div className="w-full">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted sm:hidden">{levelTitle(lvl.level)}</div>
            <div className="font-display text-lg font-extrabold sm:text-2xl">
              {profile.xp} <span className="text-xs text-muted sm:text-base">XP</span>
            </div>
            <ProgressBar value={lvl.progress} className="mt-1 h-2 sm:mt-2 sm:h-3" />
            <div className="mt-1 hidden text-xs text-muted sm:block">ještě {lvl.toNext} XP do levelu {lvl.level + 1}</div>
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle action={<Link href="/app/practice" className="text-sm font-bold text-brand-600">Všechny typy →</Link>}>
          Dnešní trénink
        </SectionTitle>
        {weak.length ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {weak.map((t, i) => {
              const meta = taskTypeMeta(t.type)!;
              return (
                <Link
                  key={t.type}
                  href={`/app/practice/${t.type}`}
                  className="group flex animate-fade-up items-center gap-3 rounded-3xl border-2 border-border bg-surface p-3 shadow-[0_4px_0_0_var(--border)] transition hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none sm:block sm:p-4"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-3xl">{meta.emoji}</span>
                    {t.openMistakes > 0 && (
                      <Badge tone="bad" className="max-sm:hidden">
                        {count(t.openMistakes, "chyba", "chyby", "chyb")}
                      </Badge>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display font-extrabold sm:mt-2 sm:whitespace-normal">{meta.name}</div>
                    <div className="text-sm text-muted sm:mt-1">
                      {t.accuracy !== null ? `úspěšnost ${Math.round(t.accuracy * 100)} %` : "zatím bez dat"}
                      {t.openMistakes > 0 && <span className="text-rose-500 sm:hidden"> · {count(t.openMistakes, "chyba", "chyby", "chyb")}</span>}
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 shrink-0 text-brand-600 sm:hidden" />
                  <div className="mt-3 hidden items-center gap-1 text-sm font-bold text-brand-600 sm:flex">
                    Trénovat <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <Card className="text-sm text-muted">Po prvním testu ti tu doporučíme typy úloh, které potřebuješ nejvíc.</Card>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <div className="font-display font-extrabold">Posledních 7 dní</div>
            <Link href="/app/progress" className="text-sm font-bold text-brand-600">
              Pokrok →
            </Link>
          </div>
          <div className="flex h-28 items-end gap-2">
            {last7.map((d) => {
              const max = Math.max(profile.daily_goal_min, ...last7.map((x) => x.min));
              return (
                <div key={d.key} className="flex flex-1 flex-col items-center gap-1">
                  <div className="text-[10px] font-bold text-muted">{d.min || ""}</div>
                  <div
                    className={`w-full rounded-lg ${d.min >= profile.daily_goal_min ? "bg-emerald-500" : d.min ? "bg-brand-400" : "bg-surface-2"}`}
                    style={{ height: `${Math.max(6, (d.min / max) * 80)}px` }}
                  />
                  <div className="text-[11px] font-bold capitalize text-muted">{d.label}</div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card className="flex flex-col">
          <div className="font-display font-extrabold">Testy</div>
          {last?.result ? (
            <div className="mt-2 flex-1">
              <div className="text-sm text-muted">Poslední: {testTitle(last.test_id)}</div>
              <div className="font-display text-3xl font-extrabold">
                {last.result.percent} %{" "}
                {last.result.percentile !== null && <span className="text-base text-muted">≈ {last.result.percentile}. percentil</span>}
              </div>
              <div className="mt-1 text-sm text-muted">Dokončeno testů: {completed.length}</div>
            </div>
          ) : (
            <div className="mt-2 flex-1 text-sm text-muted">Zatím žádný dokončený test.</div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {last && (
              <ButtonLink href={`/app/results/${last.id}`} variant="secondary" size="sm">
                Rozbor
              </ButtonLink>
            )}
            <ButtonLink href="/app/tests" size="sm">
              Nový test
            </ButtonLink>
          </div>
        </Card>
      </section>

      {openMistakes.length > 0 && (
        <Link
          href="/app/mistakes"
          className="flex items-center gap-4 rounded-3xl border-2 border-rose-200 bg-rose-50 p-4 transition hover:-translate-y-0.5 dark:border-rose-900 dark:bg-rose-900/20"
        >
          <Target className="h-8 w-8 text-rose-500" />
          <div className="flex-1">
            <div className="font-display text-lg font-extrabold">{count(openMistakes.length, "úloha čeká", "úlohy čekají", "úloh čeká")} na opravu</div>
            <div className="text-sm text-muted">Každá opravená chyba = +15 XP a o kus jistější výsledek.</div>
          </div>
          <ArrowRight className="h-6 w-6 text-rose-500" />
        </Link>
      )}
    </div>
  );
}

function lastDays(n: number) {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => new Date(now - (n - 1 - i) * 86400000));
}

function pragueHour() {
  return Number(new Intl.DateTimeFormat("cs-CZ", { hour: "numeric", hour12: false, timeZone: "Europe/Prague" }).format(new Date()));
}
