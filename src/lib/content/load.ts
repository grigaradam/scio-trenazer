import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { ExamId, Group, Question, TestFile } from "./types";

const cache = new Map<string, TestFile[]>();

/** All tests of an exam, newest first. Includes answer keys – never send to the client as-is. */
export function getTests(exam: ExamId = "osp"): TestFile[] {
  const hit = cache.get(exam);
  if (hit) return hit;
  const dir = path.join(process.cwd(), "content", exam, "tests");
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    files = [];
  }
  const tests = files
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as TestFile)
    .sort((a, b) => (a.date === b.date ? a.variant.localeCompare(b.variant) : b.date.localeCompare(a.date)));
  cache.set(exam, tests);
  return tests;
}

export function getTest(id: string): TestFile | undefined {
  for (const exam of ["osp"] as ExamId[]) {
    const t = getTests(exam).find((x) => x.id === id);
    if (t) return t;
  }
  return undefined;
}

export interface LocatedQuestion {
  test: TestFile;
  sectionId: "verbal" | "analytic";
  group: Group;
  question: Question;
}

export function findQuestion(testId: string, n: number): LocatedQuestion | undefined {
  const test = getTest(testId);
  if (!test) return undefined;
  for (const s of test.sections)
    for (const g of s.groups)
      for (const q of g.questions) if (q.n === n) return { test, sectionId: s.id, group: g, question: q };
  return undefined;
}

/** Every original question of a task type – used as few-shot examples for the generator. */
export function questionsOfType(exam: ExamId, type: string): { test: TestFile; group: Group; question: Question }[] {
  const out: { test: TestFile; group: Group; question: Question }[] = [];
  for (const test of getTests(exam))
    for (const s of test.sections)
      for (const g of s.groups) if (g.taskType === type) for (const q of g.questions) out.push({ test, group: g, question: q });
  return out;
}

export function groupsOfType(exam: ExamId, type: string): { test: TestFile; group: Group }[] {
  const out: { test: TestFile; group: Group }[] = [];
  for (const test of getTests(exam))
    for (const s of test.sections) for (const g of s.groups) if (g.taskType === type) out.push({ test, group: g });
  return out;
}
