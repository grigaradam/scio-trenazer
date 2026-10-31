import Link from "next/link";
import { MixPicker } from "@/components/MixPicker";
import { ProLock } from "@/components/Pro";
import { Badge, ProgressBar } from "@/components/ui";
import { SECTION_META, taskTypesFor } from "@/lib/content/exams";
import type { SectionId } from "@/lib/content/types";
import { BASIC } from "@/lib/plans";
import { getPlan, requireUser } from "@/lib/server/auth";
import { masteryLevel } from "@/lib/mastery";
import { getTypeStats, practiceToday } from "@/lib/server/queries";

export const metadata = { title: "Trénink" };

export default async function PracticeHub() {
  const { user } = await requireUser();
  const [stats, plan] = await Promise.all([getTypeStats(user.id), getPlan(user.id)]);
  const basic = plan === "basic";
  const basicLeft = basic ? Math.max(0, BASIC.dailyTasks - (await practiceToday(user.id))) : null;
  const weakest = [...stats].filter((s) => s.mastery !== null).sort((a, b) => a.mastery! - b.mastery!)[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-extrabold">Trénink</h1>
        <p className="mt-1 text-muted">
          {basic
            ? `V Basic trénuješ Mix – ${BASIC.dailyTasks} úloh denně ze všech typů. Nejdřív přijdou na řadu tvoje chyby, pak úlohy, které jsi ještě neviděl(a).`
            : "Vyber typ úloh. Nejdřív přijdou na řadu tvoje chyby, pak nekonečno nových úloh od AI – každá prošla kontrolou kvality a nikdy se ti nezopakuje."}
        </p>
      </div>
      <MixPicker mistakes={Object.fromEntries(stats.map((s) => [s.type, s.openMistakes]))} basicLeft={basicLeft} />
      {(["verbal", "analytic"] as SectionId[]).map((section) => (
        <section key={section}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className={`font-display text-xl font-bold ${section === "verbal" ? "text-verbal-600" : "text-analytic-600"}`}>
              {SECTION_META[section].title}
            </h2>
            {basic ? (
              <ProLock label="celý oddíl v Pro" />
            ) : (
              <Link
                href={`/app/practice/mix?types=${taskTypesFor("osp", section).map((t) => t.id).join(",")}`}
                className="text-sm font-bold text-brand-600"
              >
                Trénovat oddíl →
              </Link>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {taskTypesFor("osp", section).map((t) => {
              const s = stats.find((x) => x.type === t.id)!;
              return (
                <Link
                  key={t.id}
                  href={`/app/practice/${t.id}`}
                  className={`group relative flex items-center gap-3 rounded-3xl border-2 bg-surface p-3 shadow-[0_4px_0_0_var(--border)] transition hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none sm:flex-col sm:items-stretch sm:p-4 ${basic ? "border-dashed border-border" : weakest?.type === t.id ? "border-brand-300 dark:border-brand-700" : "border-border"}`}
                >
                  <div className="flex shrink-0 items-start justify-between gap-2">
                    <span className="text-3xl transition group-hover:scale-110">{t.emoji}</span>
                    <div className="flex flex-col items-end gap-1 max-sm:hidden">
                      {basic && <ProLock />}
                      {weakest?.type === t.id && <Badge tone="brand">tady se nejvíc zlepšíš</Badge>}
                      {s.openMistakes > 0 && <Badge tone="warn">{s.openMistakes} k opravě</Badge>}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-display font-extrabold sm:mt-2">
                      <span className="truncate sm:whitespace-normal">{t.name}</span>
                      {basic && <ProLock className="sm:hidden" />}
                      {s.openMistakes > 0 && (
                        <span className="shrink-0 rounded-full bg-amber-100 px-1.5 text-[11px] font-bold text-amber-800 sm:hidden dark:bg-amber-900/40 dark:text-amber-300">
                          {s.openMistakes}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 hidden flex-1 text-sm text-muted sm:block">{t.description}</div>
                    <div className="mt-1.5 sm:mt-3">
                      <div className="mb-1 flex justify-between text-xs font-bold text-muted">
                        <span>{s.mastery !== null ? `zvládnutí ${Math.round(s.mastery * 100)} %` : "zatím bez dat"}</span>
                        <span>{s.practiceCount ? `${s.practiceCount}×` : ""}</span>
                      </div>
                      <ProgressBar
                        value={s.mastery ?? 0}
                        className="h-2"
                        barClassName={masteryLevel(s.mastery ?? 0).bar}
                      />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
