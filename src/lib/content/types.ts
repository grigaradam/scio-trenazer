// Content model for exams. Test JSON files in content/<exam>/tests/*.json follow TestFile.
// Answer keys (`answer`, `solution`) live only on the server; the client receives
// the stripped variant (see strip.ts).

export type ExamId = "osp" | "zsv" | "aj" | "mat";

export type SectionId = "verbal" | "analytic";

export type OspTaskType =
  // verbal
  | "doplnovani"
  | "analogie"
  | "synonyma"
  | "nesoulad"
  | "vyplyvani"
  | "porozumeni"
  | "dva_texty"
  // analytic
  | "data"
  | "porovnani"
  | "dostatecnost"
  | "slovni"
  | "vyrazy"
  | "podminky";

export type TaskType = OspTaskType;

/** Option keys: A–D for normal questions, E–H for the antonym half of synonyma tasks. */
export type OptionKey = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

export interface Option {
  key: OptionKey;
  /** Rich text (see "Rich text" below). */
  text: string;
}

/**
 * One answerable part. Most questions have exactly one part; synonyma tasks have two
 * ("synonymum" with A–D, "antonymum" with E–H), each worth half a point.
 */
export interface QuestionPart {
  label?: "synonymum" | "antonymum";
  options: Option[];
  answer: OptionKey;
  /** Extra answers officially accepted by Scio (rare, e.g. after an appeal). */
  alsoAccepted?: OptionKey[];
}

export interface Question {
  /** Number in the original test (1–66). */
  n: number;
  /** Rich text of the question itself. */
  stem: string;
  /** For porovnani tasks: the two compared expressions (rich text). Stem then holds the shared info. */
  compare?: { left: string; right: string };
  /** Optional image path relative to /public, e.g. "/figures/osp-2025-12-a/q42.png". */
  figure?: string;
  parts: QuestionPart[];
  /** Short Czech justification of the key (1–4 sentences). Server-only. */
  solution: string;
  /** Task removed from scoring by Scio (NOK decision) – shown, but worth 0 points. */
  excluded?: boolean;
}

export interface Group {
  /** Unique within the test, e.g. "g01". */
  id: string;
  taskType: TaskType;
  /** Instruction shown above the group (rich text), copied from the test. */
  instruction: string;
  /** Shared text for several questions (passage, set of conditions, data description). */
  passage?: string;
  /** Title of the shared text block, e.g. "TEXT K ÚLOHÁM 24 AŽ 26". */
  passageTitle?: string;
  /** Shared figure (graph/table image) for the whole group. */
  figure?: string;
  questions: Question[];
}

export interface Section {
  id: SectionId;
  title: string;
  timeLimitSec: number;
  groups: Group[];
}

export interface TestStats {
  participants: number;
  mean: number;
  median: number;
  sd: number;
  maxScore: number;
  minScore: number;
}

export interface TestFile {
  id: string;
  exam: ExamId;
  /** Human title, e.g. "OSP – Prosinec 2025, varianta A". */
  title: string;
  /** "YYYY-MM" */
  date: string;
  variant: "A" | "B";
  /** Original PDF filename. */
  source: string;
  stats: TestStats;
  sections: Section[];
}

/*
 * Rich text = Markdown subset:
 *  - **bold**, *italic*, <u>underline</u>, ==highlight==
 *  - math in KaTeX: inline $\frac{1}{3}$, display $$...$$
 *  - GFM tables, numbered/bulleted lists, line breaks as blank line between paragraphs
 *  - blanks in sentences: "______" (6 underscores)
 */
