import { notFound, redirect } from "next/navigation";
import { ResultsView } from "@/components/ResultsView";
import { getTest } from "@/lib/content/load";
import { stripTest } from "@/lib/content/public";
import { requireUser } from "@/lib/server/auth";
import { emptySection } from "@/lib/scoring";
import { compareLastTests, getAttempt, getAttempts, testTitle } from "@/lib/server/queries";

export const metadata = { title: "Výsledky" };

export default async function ResultsPage({ params, searchParams }: PageProps<"/app/results/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const { user } = await requireUser();
  const attempt = await getAttempt(user.id, id);
  if (!attempt) notFound();
  if (attempt.status !== "completed" || !attempt.result) redirect(`/app/test/${id}`);
  const test = getTest(attempt.test_id);
  if (!test) notFound();

  const all = await getAttempts(user.id);
  const done = all.filter((a) => a.status === "completed" && a.result && a.completed_at! <= attempt.completed_at!);
  const comparison = compareLastTests(done);

  return (
    <ResultsView
      attemptId={attempt.id}
      test={stripTest(test)}
      result={attempt.result}
      activeSeconds={attempt.active_seconds}
      pauses={attempt.pause_count}
      isNew={sp.new === "1"}
      xp={Number(sp.xp ?? 0)}
      achievements={typeof sp.ach === "string" && sp.ach ? sp.ach.split(",") : []}
      comparison={
        comparison && comparison.current.id === attempt.id
          ? { previousTitle: testTitle(comparison.previous.test_id), previousPercent: Math.round((Number(comparison.previous.score) / Number(comparison.previous.max_score)) * 100), rows: comparison.rows }
          : null
      }
      isDiagnostic={attempt.is_diagnostic}
      retakeSection={attempt.retake_section ? null : emptySection(attempt.result)}
    />
  );
}
