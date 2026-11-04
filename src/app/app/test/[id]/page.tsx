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

  const full: Record<string, number> = Object.fromEntries(test.sections.map((s) => [s.id, s.timeLimitSec]));
  const timeLeft: Record<string, number> = attempt.time_left ?? {};
  const first = test.sections[0].id;
  const retake = attempt.retake_section ?? null;
  // a retake starts with the other section's answers already there, so only time tells
  const resumed = retake
    ? (timeLeft[retake] ?? 0) < full[retake]
    : Object.keys(attempt.answers ?? {}).length > 0 || attempt.section_index > 0 || (timeLeft[first] ?? 0) < full[first];

  // a first section whose time ran out continues with the second one
  const sectionIndex = attempt.section_index === 0 && (timeLeft[first] ?? 0) <= 0 ? 1 : attempt.section_index;

  return (
    <TestRunner
      attemptId={attempt.id}
      test={stripTest(test)}
      initial={{
        sectionIndex,
        timeLeft,
        answers: attempt.answers ?? {},
        flags: attempt.flags ?? [],
        resumed,
      }}
      retakeSection={retake}
    />
  );
}
