import "server-only";
import { after } from "next/server";
import { tryBudget } from "@/lib/ai/client";
import { generateTasks } from "@/lib/ai/generate";
import type { ExamId, TaskType } from "@/lib/content/types";
import { createAdminClient } from "@/lib/supabase/admin";

/** How many unseen, ready-made tasks of a type we keep waiting for each user. */
const BUFFER = 1;
const MAX_ATTEMPTS = 3;
const inflight = new Set<string>();

async function waitingCount(userId: string, exam: ExamId, type: TaskType) {
  const { data } = await createAdminClient().rpc("pick_generated_tasks", {
    p_user: userId,
    p_exam: exam,
    p_type: type,
    p_limit: BUFFER,
  });
  return (data ?? []).length;
}

/**
 * After the response is sent, make sure the user has a pre-generated task of this type waiting in
 * the shared pool. Tasks stay in the database until served, so an unused one is used next time.
 * Retries when the quality validator rejects a candidate.
 */
export function ensureTaskBuffer(userId: string, exam: ExamId, type: TaskType) {
  after(async () => {
    const key = `${userId}:${type}`;
    if (inflight.has(key)) return; // a top-up for this user/type is already running on this instance
    inflight.add(key);
    try {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if ((await waitingCount(userId, exam, type)) >= BUFFER) return;
        if (!(await tryBudget(userId, "generate"))) return;
        const outcome = await generateTasks({ exam, type, count: 1, userId });
        if (outcome.accepted.length) return;
      }
    } catch (e) {
      console.error("task buffer top-up", e);
    } finally {
      inflight.delete(key);
    }
  });
}
