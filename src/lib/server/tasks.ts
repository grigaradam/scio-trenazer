import "server-only";
import { findQuestion } from "@/lib/content/load";
import { parseRef } from "@/lib/content/public";
import type { Group, Question, TaskType } from "@/lib/content/types";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ResolvedTask {
  ref: string;
  taskType: TaskType;
  /** Group with only the referenced question (keeps passage/figure/instruction). */
  group: Group;
  question: Question;
  origin: { kind: "test"; testId: string; testTitle: string; n: number } | { kind: "gen"; taskId: string; idx: number };
}

/** Resolves "test:<id>:<n>" or "gen:<uuid>:<idx>" to the full task including the key. */
export async function resolveTask(ref: string): Promise<ResolvedTask | null> {
  const parsed = parseRef(ref);
  if (!parsed) return null;
  if (parsed.kind === "test") {
    const hit = findQuestion(parsed.testId, parsed.n);
    if (!hit) return null;
    return {
      ref,
      taskType: hit.group.taskType,
      group: { ...hit.group, questions: [hit.question] },
      question: hit.question,
      origin: { kind: "test", testId: hit.test.id, testTitle: hit.test.title, n: hit.question.n },
    };
  }
  const admin = createAdminClient();
  const { data } = await admin.from("generated_tasks").select("id,task_type,payload").eq("id", parsed.taskId).maybeSingle();
  if (!data) return null;
  const group = data.payload as Group;
  const idx = parsed.idx ?? 0;
  const question = group.questions[idx];
  if (!question) return null;
  return {
    ref: `gen:${data.id}:${idx}`,
    taskType: data.task_type as TaskType,
    group: { ...group, questions: [question] },
    question,
    origin: { kind: "gen", taskId: data.id as string, idx },
  };
}
