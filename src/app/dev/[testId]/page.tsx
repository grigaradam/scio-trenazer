import { notFound } from "next/navigation";
import { ContentPreview } from "@/components/dev/ContentPreview";
import { ChartSamples } from "@/components/dev/ChartSamples";
import { MathSamples } from "@/components/dev/MathSamples";
import { TestRunner } from "@/components/TestRunner";
import { getTest, getTests } from "@/lib/content/load";
import { stripTest } from "@/lib/content/public";

// Development-only content QA: /dev/<testId> shows every task with its key, ?runner=1 opens the test runner.
export default async function DevPreview({ params, searchParams }: PageProps<"/dev/[testId]">) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { testId } = await params;
  const sp = await searchParams;
  if (testId === "charts") return <ChartSamples />;
  if (testId === "math") return <MathSamples />;
  const test = testId === "index" ? getTests("osp")[0] : getTest(testId);
  if (!test) notFound();
  if (sp.runner) {
    return (
      <TestRunner
        attemptId="dev"
        test={stripTest(test)}
        initial={{ sectionIndex: 0, timeLeft: { verbal: 2100, analytic: 3000 }, answers: {}, flags: [], resumed: false }}
      />
    );
  }
  return <ContentPreview test={test} all={getTests("osp").map((t) => t.id)} />;
}
