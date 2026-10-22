import { notFound, redirect } from "next/navigation";
import { TestRunner } from "@/components/TestRunner";
import { getTest } from "@/lib/content/load";
import { stripTest } from "@/lib/content/public";
import { requireUser } from "@/lib/server/auth";
import { getAttempt } from "@/lib/server/queries";

export const metadata = { title: "Test" };

export default async function TestPage({ params }: PageProps<"/app/test/[id]">) {
  const { id } = await params;
  const { user } = await requireUser();
  const attempt = await getAttempt(user.id, id);
  if (!attempt) notFound();
  if (attempt.status === "completed") redirect(`/app/results/${id}`);
  const test = getTest(attempt.test_id);
  if (!test) notFound();

  const full = Object.fromEntries(test.sections.map((s) => [s.id, s.timeLimitSec]));
  const resumed =
    Object.keys(attempt.answers ?? {}).length > 0 ||
    attempt.section_index > 0 ||
    attempt.time_left.verbal < full.verbal;

  // a verbal section whose time ran out continues with the analytic one
  const sectionIndex = attempt.section_index === 0 && attempt.time_left.verbal <= 0 ? 1 : attempt.section_index;

  return (
    <TestRunner
      attemptId={attempt.id}
      test={stripTest(test)}
      initial={{
        sectionIndex,
        timeLeft: attempt.time_left,
        answers: attempt.answers ?? {},
        flags: attempt.flags ?? [],
        resumed,
      }}
    />
  );
}
