// Client-safe shapes (no answer keys) and helpers shared by client and server.
import type { Group, OptionKey, Question, QuestionPart, Section, TestFile } from "./types";

export type PublicPart = Omit<QuestionPart, "answer">;
export type PublicQuestion = Omit<Question, "parts" | "solution"> & { parts: PublicPart[] };
export type PublicGroup = Omit<Group, "questions"> & { questions: PublicQuestion[] };
export type PublicSection = Omit<Section, "groups"> & { groups: PublicGroup[] };
export type PublicTest = Omit<TestFile, "sections"> & { sections: PublicSection[] };

/** Answers given by a user: question number (or local index) → one entry per part. */
export type AnswerMap = Record<string, (OptionKey | null)[]>;

export function stripQuestion(q: Question): PublicQuestion {
  return {
    n: q.n,
    stem: q.stem,
    ...(q.compare ? { compare: q.compare } : {}),
    ...(q.figure ? { figure: q.figure } : {}),
    ...(q.excluded ? { excluded: true } : {}),
    parts: q.parts.map((p) => ({ ...(p.label ? { label: p.label } : {}), options: p.options })),
  };
}

export function stripGroup(g: Group): PublicGroup {
  return { ...g, questions: g.questions.map(stripQuestion) };
}

export function stripTest(t: TestFile): PublicTest {
  return { ...t, sections: t.sections.map((s) => ({ ...s, groups: s.groups.map(stripGroup) })) };
}

export const testRef = (testId: string, n: number) => `test:${testId}:${n}`;
export const genRef = (taskId: string, idx?: number) => (idx === undefined ? `gen:${taskId}` : `gen:${taskId}:${idx}`);

export function parseRef(ref: string):
  | { kind: "test"; testId: string; n: number }
  | { kind: "gen"; taskId: string; idx: number | null }
  | null {
  const parts = ref.split(":");
  if (parts[0] === "test" && parts.length === 3) return { kind: "test", testId: parts[1], n: Number(parts[2]) };
  if (parts[0] === "gen" && (parts.length === 2 || parts.length === 3))
    return { kind: "gen", taskId: parts[1], idx: parts.length === 3 ? Number(parts[2]) : null };
  return null;
}
