// Scio scoring: correct +1, wrong −1/3, blank 0. Synonym/antonym tasks consist of two halves,
// each worth ±½ (wrong half −1/6). Pure functions – usable on server and client.
import type { AnswerMap } from "./content/public";
import type { OptionKey, Question, SectionId, TaskType, TestFile, TestStats } from "./content/types";

export type QuestionStatus = "correct" | "wrong" | "partial" | "blank";

export interface QuestionResult {
  n: number;
  section: SectionId;
  taskType: TaskType;
  given: (OptionKey | null)[];
  answer: OptionKey[];
  points: number;
  status: QuestionStatus;
}

export interface Bucket {
  correct: number;
  wrong: number;
  blank: number;
  partial: number;
  score: number;
  max: number;
}

export interface TestResult {
  score: number;
  maxScore: number;
  percent: number;
  percentile: number | null;
  sections: Record<SectionId, Bucket>;
  types: Partial<Record<TaskType, Bucket>>;
  questions: QuestionResult[];
}

// A section with no answer at all while the other one was worked on – almost always lost
// answers rather than a choice, so the student may fill it in once afterwards.
export function emptySection(result: TestResult): SectionId | null {
  const answered = (b: Bucket) => b.correct + b.wrong + b.partial;
  const { verbal, analytic } = result.sections;
  if (verbal.max > 0 && answered(verbal) === 0 && answered(analytic) > 0) return "verbal";
  if (analytic.max > 0 && answered(analytic) === 0 && answered(verbal) > 0) return "analytic";
  return null;
}

const emptyBucket = (): Bucket => ({ correct: 0, wrong: 0, blank: 0, partial: 0, score: 0, max: 0 });

export function scoreQuestion(q: Question, given: (OptionKey | null)[] | undefined) {
  const weight = 1 / q.parts.length;
  let points = 0;
  let right = 0;
  let wrong = 0;
  q.parts.forEach((p, i) => {
    const g = given?.[i] ?? null;
    if (g === null) return;
    if (g === p.answer || p.alsoAccepted?.includes(g)) {
      points += weight;
      right++;
    } else {
      points -= weight / 3;
      wrong++;
    }
  });
  let status: QuestionStatus;
  if (right === q.parts.length) status = "correct";
  else if (right === 0 && wrong === 0) status = "blank";
  else if (right === 0) status = "wrong";
  else status = "partial";
  return { points, status };
}

export function scoreTest(test: TestFile, answers: AnswerMap): TestResult {
  const sections = { verbal: emptyBucket(), analytic: emptyBucket() } as Record<SectionId, Bucket>;
  const types: Partial<Record<TaskType, Bucket>> = {};
  const questions: QuestionResult[] = [];
  let score = 0;
  let maxScore = 0;

  for (const s of test.sections) {
    for (const g of s.groups) {
      for (const q of g.questions) {
        const given = answers[String(q.n)] ?? q.parts.map(() => null);
        if (q.excluded) continue;
        const { points, status } = scoreQuestion(q, given);
        score += points;
        maxScore += 1;
        const buckets = [sections[s.id], (types[g.taskType] ??= emptyBucket())];
        for (const b of buckets) {
          b.score += points;
          b.max += 1;
          b[status === "correct" ? "correct" : status === "wrong" ? "wrong" : status === "partial" ? "partial" : "blank"]++;
        }
        questions.push({
          n: q.n,
          section: s.id,
          taskType: g.taskType,
          given: q.parts.map((_, i) => given[i] ?? null),
          answer: q.parts.map((p) => p.answer),
          points: round(points),
          status,
        });
      }
    }
  }
  for (const b of [...Object.values(sections), ...Object.values(types)]) b.score = round(b.score);
  score = round(score);
  return {
    score,
    maxScore,
    percent: maxScore ? Math.max(0, Math.round((score / maxScore) * 100)) : 0,
    percentile: estimatePercentile(score, test.stats),
    sections,
    types,
    questions,
  };
}

/** Rough percentile from the test's published mean/SD (normal approximation). */
export function estimatePercentile(score: number, stats?: TestStats): number | null {
  if (!stats || !stats.sd) return null;
  const z = (score - stats.mean) / stats.sd;
  return Math.max(0, Math.min(100, Math.round(normalCdf(z) * 100)));
}

function normalCdf(z: number) {
  // Abramowitz–Stegun approximation of the error function.
  const t = 1 / (1 + 0.3275911 * Math.abs(z / Math.SQRT2));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

const round = (x: number) => Math.round(x * 100) / 100;

export const bucketAccuracy = (b: Bucket) => {
  const attempted = b.correct + b.wrong + b.partial;
  return attempted ? b.correct / attempted : 0;
};
