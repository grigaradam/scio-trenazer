import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { StartTestButton } from "@/components/StartTestButton";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { getTests } from "@/lib/content/load";
import { requireUser } from "@/lib/server/auth";
import { getAttempts } from "@/lib/server/queries";

export const metadata = { title: "Testy" };

export default async function TestsPage() {
  const { user } = await requireUser();
  const attempts = await getAttempts(user.id);
  const tests = getTests("osp");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold">Testy OSP</h1>
        <p className="mt-1 text-muted">
          Ostré testy z minulých let · 66 úloh · 35 + 50 minut. Doporučujeme ten, který jsi ještě nedělal(a).
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {tests.map((t, i) => {
          const mine = attempts.filter((a) => a.test_id === t.id);
          const open = mine.find((a) => a.status === "in_progress");
          const done = mine.filter((a) => a.status === "completed" && a.result);
          const best = done.reduce((m, a) => Math.max(m, a.result!.percent), -1);
          const lastDone = done[0];
          return (
            <Card key={t.id} className="flex animate-fade-up flex-col gap-3" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-display text-lg font-extrabold">{t.title.replace("OSP – ", "")}</div>
                  <div className="text-xs text-muted">
                    průměr účastníků {t.stats.mean.toLocaleString("cs-CZ")} b. · {t.stats.participants.toLocaleString("cs-CZ")} účastníků
                  </div>
                </div>
                {done.length > 0 ? (
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
                {open ? (
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
                    <div className="font-bold">{tests.find((t) => t.id === a.test_id)?.title ?? a.test_id}</div>
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
