import "server-only";
import { after } from "next/server";
import { tryBudget } from "@/lib/ai/client";
import { GENERATOR_VERSION, generateTasks } from "@/lib/ai/generate";
import type { ExamId, TaskType } from "@/lib/content/types";
import { createAdminClient } from "@/lib/supabase/admin";

/** How many unseen, ready-made tasks of a type we keep waiting for each user. */
const BUFFER = 3;
const MAX_ATTEMPTS = 4;
const inflight = new Set<string>();

/** Unseen pool tasks for a user, current generator version only (older, easier tasks are skipped). */
export async function pickUnseen(userId: string, exam: ExamId, type: TaskType, limit: number) {
  const { data } = await createAdminClient().rpc("pick_generated_tasks", {
    p_user: userId,
    p_exam: exam,
    p_type: type,
    p_limit: 60,
  });
  return ((data ?? []) as { id: string; payload: { v?: number } & Record<string, unknown>; served_count: number }[])
    .filter((t) => (t.payload.v ?? 1) >= GENERATOR_VERSION)
    .slice(0, limit);
}

async function waitingCount(userId: string, exam: ExamId, type: TaskType) {
  return (await pickUnseen(userId, exam, type, BUFFER)).length;
}

/**
 * After the response is sent, make sure the user has BUFFER pre-generated tasks of this type waiting in
 * the shared pool. Tasks stay in the database until served, so an unused one is used next time.
 * Retries when the quality validator rejects a candidate.
 */
export function ensureTaskBuffer(userId: string, exam: ExamId, type: TaskType) {
  after(async () => {
    const key = `${userId}:${type}`;
    if (inflight.has(key)) return; // a top-up for this user/type is already running on this instance
    inflight.add(key);
    const deadline = Date.now() + 270_000; // background work shares the request's 300 s limit
    try {
      for (let attempt = 0; attempt < MAX_ATTEMPTS && Date.now() + 120_000 < deadline; attempt++) {
        const missing = BUFFER - (await waitingCount(userId, exam, type));
        if (missing <= 0) return;
        if (!(await tryBudget(userId, "generate"))) return;
        await generateTasks({ exam, type, count: missing, userId, deadline }); // candidates run in parallel
      }
    } catch (e) {
      console.error("task buffer top-up", e);
    } finally {
      inflight.delete(key);
    }
  });
}

/** How many current-version tasks of a type exist in the pool (what a brand-new user can get instantly). */
export async function poolStock(exam: ExamId, type: TaskType) {
  const { data } = await createAdminClient()
    .from("generated_tasks")
    .select("id,payload->v")
    .eq("exam", exam)
    .eq("task_type", type);
  return ((data ?? []) as { v?: number | null }[]).filter((r) => Number(r.v ?? 1) >= GENERATOR_VERSION).length;
}
