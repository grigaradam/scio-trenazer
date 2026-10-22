import Link from "next/link";
import { Badge, ProgressBar } from "@/components/ui";
import { SECTION_META, taskTypesFor } from "@/lib/content/exams";
import type { SectionId } from "@/lib/content/types";
import { requireUser } from "@/lib/server/auth";
import { getTypeStats } from "@/lib/server/queries";

export const metadata = { title: "Trénink" };

export default async function PracticeHub() {
  const { user } = await requireUser();
  const stats = await getTypeStats(user.id);
  const weakest = [...stats].filter((s) => s.accuracy !== null).sort((a, b) => a.accuracy! - b.accuracy!)[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-extrabold">Trénink</h1>
        <p className="mt-1 text-muted">
          Vyber typ úloh. Nejdřív přijdou na řadu tvoje chyby, pak nekonečno nových úloh od AI – každá prošla kontrolou
          kvality a nikdy se ti nezopakuje.
        </p>
      </div>
      {(["verbal", "analytic"] as SectionId[]).map((section) => (
        <section key={section}>
          <h2 className={`mb-3 font-display text-xl font-bold ${section === "verbal" ? "text-verbal-600" : "text-analytic-600"}`}>
            {SECTION_META[section].title}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {taskTypesFor("osp", section).map((t) => {
              const s = stats.find((x) => x.type === t.id)!;
              return (
                <Link
                  key={t.id}
                  href={`/app/practice/${t.id}`}
                  className={`group relative flex flex-col rounded-3xl border-2 bg-surface p-4 shadow-[0_4px_0_0_var(--border)] transition hover:-translate-y-0.5 ${weakest?.type === t.id ? "border-rose-300 dark:border-rose-800" : "border-border"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-3xl transition group-hover:scale-110">{t.emoji}</span>
                    <div className="flex flex-col items-end gap-1">
                      {weakest?.type === t.id && <Badge tone="bad">nejslabší</Badge>}
                      {s.openMistakes > 0 && <Badge tone="warn">{s.openMistakes} k opravě</Badge>}
                    </div>
                  </div>
                  <div className="mt-2 font-display font-extrabold">{t.name}</div>
                  <div className="mt-0.5 flex-1 text-sm text-muted">{t.description}</div>
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs font-bold text-muted">
                      <span>{s.accuracy !== null ? `úspěšnost ${Math.round(s.accuracy * 100)} %` : "zatím bez dat"}</span>
                      <span>{s.practiceCount ? `${s.practiceCount}× trénováno` : ""}</span>
                    </div>
                    <ProgressBar
                      value={s.accuracy ?? 0}
                      className="h-2"
                      barClassName={(s.accuracy ?? 0) >= 0.7 ? "bg-emerald-500" : (s.accuracy ?? 0) >= 0.4 ? "bg-amber-400" : "bg-rose-500"}
                    />
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
