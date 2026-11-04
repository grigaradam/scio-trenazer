import "server-only";
import { after } from "next/server";
import { tryBudget } from "@/lib/ai/client";
import { GENERATOR_VERSION, generateTasks } from "@/lib/ai/generate";
import { optionShapeIssues } from "@/lib/ai/option-shape";
import { easyRecently, familyAllowed } from "@/lib/ai/families";
import { diversify, focusOf, servedHistory, split } from "@/lib/ai/variety";
import { TASK_TYPES } from "@/lib/content/exams";
import type { ExamId, Group, TaskType } from "@/lib/content/types";
import { createAdminClient } from "@/lib/supabase/admin";

/** How many unseen, ready-made tasks of a type we keep waiting for each user. */
const BUFFER = 3;
const MAX_ATTEMPTS = 4;
const inflight = new Set<string>();

type PoolPayload = {
  v?: number;
  topic?: string;
  focus?: string[];
  questions?: { stem?: string }[];
  /** correct but easier than Scio – kept rare (families.ts) */
  easy?: boolean;
  /** id of the task a variant was derived from */
  family?: string;
} & Record<string, unknown>;

async function unseen(userId: string, exam: ExamId, type: TaskType) {
  const { data } = await createAdminClient().rpc("pick_generated_tasks", {
    p_user: userId,
    p_exam: exam,
    p_type: type,
    p_limit: 60,
  });
  const current = ((data ?? []) as { id: string; payload: PoolPayload; served_count: number }[]).filter(
    (t) => (t.payload.v ?? 1) >= GENERATOR_VERSION,
  );
  // tasks stored before a format check existed: never shown, and retired so the pool refills that type
  const misshapen = current.filter((t) => optionShapeIssues(t.payload as unknown as Group, type).length);
  if (misshapen.length) void Promise.all(misshapen.map((t) => retireTask(t.id, t.payload, optionShapeIssues(t.payload as unknown as Group, type))));
  return current.filter((t) => !misshapen.includes(t));
}

/**
 * Takes a pool task out of service: v 0 makes every pool query (serving, stock counts, autogen balance) skip it,
 * the original version and the reason stay in the payload.
 */
async function retireTask(id: string, payload: PoolPayload, issues: string[]) {
  const { error } = await createAdminClient()
    .from("generated_tasks")
    .update({ payload: { ...payload, v: 0, retired: { reason: issues.join("; "), v: payload.v ?? 1, at: new Date().toISOString() } } })
    .eq("id", id);
  if (error) console.error("retireTask", id, error.message);
}

/**
 * Sweeps the whole pool for current-version tasks whose answer options don't look like real Scio options
 * (see option-shape.ts) and retires them. `dryRun` only reports.
 */
export async function retireMisshapen(opts: { dryRun?: boolean } = {}) {
  const admin = createAdminClient();
  const found: { id: string; type: TaskType; issues: string[]; options: string }[] = [];
  let total = 0;
  for (const t of TASK_TYPES) {
    const type = t.id as TaskType;
    for (let from = 0; ; from += 500) {
      const { data, error } = await admin
        .from("generated_tasks")
        .select("id,payload")
        .eq("task_type", type)
        .order("id")
        .range(from, from + 499);
      if (error) throw error;
      const rows = ((data ?? []) as { id: string; payload: PoolPayload }[]).filter((r) => (r.payload.v ?? 1) >= GENERATOR_VERSION);
      total += rows.length;
      for (const r of rows) {
        const issues = optionShapeIssues(r.payload as unknown as Group, type);
        if (!issues.length) continue;
        const g = r.payload as unknown as Group;
        found.push({ id: r.id, type, issues, options: g.questions[0]?.parts[0]?.options.map((o) => o.text).join(" | ") ?? "" });
        if (!opts.dryRun) await retireTask(r.id, r.payload, issues);
      }
      if (!data || data.length < 500) break;
    }
  }
  return { total, found };
}

/**
 * Unseen tasks the user may get now: another member of a variant family only once they had time to forget the last
 * one (FAMILY_GAP_TASKS other tasks of the type and FAMILY_GAP_DAYS). Plus what they were served lately.
 */
async function servable(userId: string, exam: ExamId, type: TaskType) {
  const [candidates, history] = await Promise.all([unseen(userId, exam, type), servedHistory(userId, type)]);
  const allowed = candidates.filter((t) => familyAllowed(t.payload.family ?? t.id, history));
  return { allowed, history, recent: history.slice(0, 6).map((h) => h.focus) };
}

/**
 * Unseen pool tasks for a user, current generator version only (older, easier tasks are skipped).
 * Tasks about the same word or topic as the ones the user just did are moved to the back, and so are easy tasks
 * right after an easy one (at most one in every EASY_WINDOW tasks of a type).
 */
export async function pickUnseen(userId: string, exam: ExamId, type: TaskType, limit: number) {
  const { allowed, history, recent } = await servable(userId, exam, type);
  const ordered = diversify(allowed, (t) => taskFocus(type, t.payload), recent);
  const spaced = easyRecently(history) ? [...ordered.filter((t) => !t.payload.easy), ...ordered.filter((t) => t.payload.easy)] : ordered;
  return spaced.slice(0, limit);
}

const taskFocus = (type: TaskType, p: PoolPayload) =>
  focusOf(type, { topic: p.topic, focus: p.focus, stem: p.questions?.[0]?.stem });

/** Waiting tasks that are about something else than what the user just did (similar ones don't count). */
async function waitingCount(userId: string, exam: ExamId, type: TaskType) {
  const { allowed, recent } = await servable(userId, exam, type);
  return split(allowed, (t) => taskFocus(type, t.payload), recent)[0].length;
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
        const waiting = await waitingCount(userId, exam, type);
        const missing = BUFFER - waiting;
        if (missing <= 0) return;
        // batch mode: while the user still has a task ready, top up through the Batch API at half the price –
        // the generation itself happens on the next cron ticks (imported lazily: autogen and batch-gen import this file)
        const { getAutogenState } = await import("./autogen");
        if (waiting > 0 && (await getAutogenState())?.mode === "batch") {
          const { enqueueJobs, queuedFor } = await import("./batch-gen");
          const need = missing - (await queuedFor(userId, type));
          if (need > 0 && (await tryBudget(userId, "generate"))) await enqueueJobs({ exam, type, count: need, userId });
          return;
        }
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
