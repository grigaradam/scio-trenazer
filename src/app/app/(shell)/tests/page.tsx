import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { ProLock } from "@/components/Pro";
import { StartTestButton } from "@/components/StartTestButton";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { EXAMS } from "@/lib/content/exams";
import { getTest, getTests } from "@/lib/content/load";
import type { ExamId } from "@/lib/content/types";
import { getPlan, requireUser } from "@/lib/server/auth";
import { basicTestId, getAttempts } from "@/lib/server/queries";

export const metadata = { title: "Testy" };

export default async function TestsPage() {
  const { user } = await requireUser();
  const [attempts, plan] = await Promise.all([getAttempts(user.id), getPlan(user.id)]);
  // Basic keeps the first test it started; before that, any one can become it
  const own = plan === "basic" ? basicTestId(attempts) : null;
  const locked = (id: string) => plan === "basic" && own !== null && id !== own;
  // its own test goes first, the locked ones after it
  const ordered = (exam: ExamId) => {
    const all = getTests(exam);
    return own ? [...all.filter((t) => t.id === own), ...all.filter((t) => t.id !== own)] : all;
  };
  const exams = EXAMS.filter((e) => e.enabled && getTests(e.id).length);
  const subtitle: Partial<Record<ExamId, string>> = {
    osp: "Ostré testy z minulých let · 66 úloh · 35 + 50 minut. Doporučujeme ten, který jsi ještě nedělal(a).",
    aj: "Reading a Use of English · 48 úloh · 40 minut (15 + 25). Poslech (úlohy 1–12, 20 minut) bez nahrávky nejde, proto chybí.",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold">Testy</h1>
        <p className="mt-1 text-muted">Ostré testy Scio z minulých let, na čas a se stejným bodováním.</p>
        {plan === "basic" && (
          <p className="mt-2 text-sm text-muted">
            {own ? "V Basic máš jeden test – ten svůj si můžeš zkoušet znovu. Ostatní jsou v Pro." : "V Basic máš jeden test – vyber si, který to bude."}
          </p>
        )}
      </div>
      {exams.map((exam) => (
      <section key={exam.id} className="space-y-3">
        <div>
          <h2 className="font-display text-2xl font-extrabold">
            {exam.emoji} {exam.name} <span className="text-muted">({exam.short})</span>
          </h2>
          <p className="mt-1 text-sm text-muted">{subtitle[exam.id]}</p>
        </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {ordered(exam.id).map((t, i) => {
          const mine = attempts.filter((a) => a.test_id === t.id);
          const open = mine.find((a) => a.status === "in_progress");
          const done = mine.filter((a) => a.status === "completed" && a.result);
          const best = done.reduce((m, a) => Math.max(m, a.result!.percent), -1);
          const lastDone = done[0];
          const lock = locked(t.id);
          return (
            <Card key={t.id} className={`flex animate-fade-up flex-col gap-3 ${lock ? "border-dashed" : ""}`} style={{ animationDelay: `${i * 40}ms` }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-display text-lg font-extrabold">{t.title.replace(/^(OSP|AJ) – /, "")}</div>
                  <div className="text-xs text-muted">
                    {t.stats
                      ? `průměr účastníků ${t.stats.mean.toLocaleString("cs-CZ")} b. · ${t.stats.participants.toLocaleString("cs-CZ")} účastníků`
                      : `${t.sections.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.questions.length, 0), 0)} úloh · přepsáno ze sešitu`}
                  </div>
                </div>
                {lock ? (
                  <ProLock />
                ) : done.length > 0 ? (
                  <Badge tone="good">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {best} %
                  </Badge>
                ) : open ? (
                  <Badge tone="warn">rozdělaný</Badge>
                ) : (
                  <Badge>nový</Badge>
                )}
              </div>
              <div className="mt-auto flex flex-wrap gap-2">
                {lock ? (
                  <span className="text-xs text-muted">Odemkne se s Pro</span>
                ) : open ? (
                  <ButtonLink href={`/app/test/${open.id}`} size="sm">
                    Pokračovat
                  </ButtonLink>
                ) : (
                  <StartTestButton testId={t.id} size="sm" variant={done.length ? "secondary" : "primary"}>
                    {done.length ? "Zkusit znovu" : "Spustit test"}
                  </StartTestButton>
                )}
                {lastDone && (
                  <ButtonLink href={`/app/results/${lastDone.id}`} variant="secondary" size="sm">
                    Rozbor
                  </ButtonLink>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      </section>
      ))}

      {attempts.some((a) => a.status === "completed") && (
        <section>
          <h2 className="mb-3 font-display text-xl font-bold">Historie pokusů</h2>
          <div className="overflow-hidden rounded-3xl border-2 border-border bg-surface">
            {attempts
              .filter((a) => a.status === "completed" && a.result)
              .map((a) => (
                <Link
                  key={a.id}
                  href={`/app/results/${a.id}`}
                  className="flex items-center gap-3 border-b-2 border-border px-4 py-3 last:border-b-0 hover:bg-surface-2"
                >
                  <div className="flex-1">
                    <div className="font-bold">{getTest(a.test_id)?.title ?? a.test_id}</div>
                    <div className="text-xs text-muted">
                      {new Date(a.completed_at!).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" })}
                      {a.is_diagnostic ? " · úvodní test" : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-lg font-extrabold">{a.result!.percent} %</div>
                    <div className="text-xs text-muted">{Number(a.score).toLocaleString("cs-CZ")} b.</div>
                  </div>
                </Link>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
