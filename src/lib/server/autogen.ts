import "server-only";
import { variantParents } from "@/lib/ai/families";
import { GENERATOR_VERSION, generateTasks } from "@/lib/ai/generate";
import { retireMisshapen } from "./pool";
import { EXAMS, TASK_TYPES, taskTypeMeta } from "@/lib/content/exams";
import type { TaskType } from "@/lib/content/types";
import { createAdminClient } from "@/lib/supabase/admin";

// Endless, balanced background generation. pg_cron calls /api/autogen/tick every minute; each tick claims the
// free worker slots and runs them for ~4.5 minutes (inside the 300 s function limit). A crashed or killed run
// simply lets its lease expire and the next tick picks the slot up again – nothing has to stay alive.

/** Seconds a slot stays claimed – a bit longer than one run. */
export const LEASE_SECONDS = 290;
const RUN_MS = 265_000;
/** Don't start a new task with less time than this left (generation + validation). */
const MIN_TASK_MS = 100_000;
/** After "no credit" errors, wait this long before probing the API again. */
export const CREDIT_RETRY_MS = 30 * 60_000;

export interface AutogenState {
  enabled: boolean;
  workers: number;
  /** sync = generation runs inside the cron worker; batch = through the Message Batches API at half price (migration 0015) */
  mode?: "sync" | "batch";
  /** Exams endless generation fills, e.g. ["osp"]; null = every enabled exam (migration 0017). */
  exams?: string[] | null;
  /** Unseen tasks per type to keep for the most active user; 0 = no limit (migration 0017). */
  stock_target?: number;
  credits_exhausted_at: string | null;
  last_tick_at: string | null;
  last_error: string | null;
  started_at: string | null;
}

export async function getAutogenState(): Promise<AutogenState | null> {
  const { data, error } = await createAdminClient().from("autogen_state").select("*").eq("id", 1).maybeSingle();
  if (error || !data) return null; // migration 0005 not applied
  return data as AutogenState;
}

export async function updateAutogenState(patch: Partial<AutogenState>) {
  await createAdminClient()
    .from("autogen_state")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", 1);
}

/** Out of money / unusable key → stop until credits are topped up. */
export function isFatalApiError(reason: string) {
  return /credit balance|billing|insufficient|purchase credits|authentication_error|invalid x-api-key|permission_error/i.test(reason);
}
const isRateLimit = (reason: string) => /\b429\b|rate.?limit|overloaded|\b529\b/i.test(reason);

/** Types endless generation may fill: enabled exams, narrowed to the ones chosen in the dashboard. */
export function autogenTypes(state?: Pick<AutogenState, "exams"> | null) {
  const exams = state?.exams?.length ? state.exams : null;
  return TASK_TYPES.filter((t) => EXAMS.some((e) => e.id === t.exam && e.enabled) && (!exams || exams.includes(t.exam)));
}

/**
 * Stock per type (migration 0017): current-version tasks, and how many of them the most active user hasn't seen yet –
 * the user closest to running out decides when a type needs new tasks. null = the function is missing.
 */
export async function typeStock(): Promise<Map<string, { ready: number; stock: number }> | null> {
  try {
    const { data, error } = await createAdminClient().rpc("autogen_stock", { p_version: GENERATOR_VERSION });
    if (error) return null;
    return new Map(((data ?? []) as { task_type: string; ready: number; stock: number }[]).map((r) => [r.task_type, { ready: Number(r.ready), stock: Number(r.stock) }]));
  } catch {
    return null;
  }
}

/**
 * The next type to generate: within the chosen exams, the one with the smallest stock (in-flight candidates count as
 * stock; ties broken randomly). null = every type has reached the stock target – nothing to do until users use it up.
 * Without migration 0017 it falls back to the fewest current-version tasks and no target.
 */
export async function pickType(inFlight: Map<string, number>, state?: Pick<AutogenState, "exams" | "stock_target"> | null): Promise<TaskType | null> {
  const types = autogenTypes(state);
  if (!types.length) return null;
  const stock = await typeStock();
  const counts = new Map<string, number>(types.map((t) => [t.id, stock?.get(t.id)?.stock ?? 0]));
  if (!stock) {
    // old way: rows of the pool (the API caps them at 1000, so this is only a rough balance)
    const { data } = await createAdminClient()
      .from("generated_tasks")
      .select("task_type,v:payload->v")
      .in("exam", [...new Set(types.map((t) => t.exam))]);
    for (const r of (data ?? []) as { task_type: string; v?: number | null }[]) {
      if (counts.has(r.task_type) && Number(r.v ?? 1) >= GENERATOR_VERSION) counts.set(r.task_type, counts.get(r.task_type)! + 1);
    }
  }
  for (const [t, n] of inFlight) if (counts.has(t)) counts.set(t, counts.get(t)! + n);
  const target = stock ? (state?.stock_target ?? 0) : 0;
  const open = [...counts].filter(([, n]) => !target || n < target);
  if (!open.length) return null;
  const min = Math.min(...open.map(([, n]) => n));
  const lowest = open.filter(([, n]) => n === min).map(([t]) => t);
  return lowest[Math.floor(Math.random() * lowest.length)] as TaskType;
}

/** How often a worker tries a variant instead of a fresh task (only variant types with a free family slot). */
export const VARIANT_CHANCE = 1 / 3;

const SWEEP_MS = 6 * 3600_000;
let lastSweep = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs the claimed worker slots in parallel until the time budget is used up. */
export async function runAutogen(slots: number[]) {
  const admin = createAdminClient();
  // retire pool tasks that fail a format check added after they were stored (so pickType sees the real stock)
  if (Date.now() - lastSweep > SWEEP_MS) {
    lastSweep = Date.now();
    await retireMisshapen().catch((e) => console.error("retireMisshapen", e));
  }
  const deadline = Date.now() + RUN_MS;
  const inFlight = new Map<string, number>();

  const worker = async (slot: number) => {
    try {
      while (Date.now() + MIN_TASK_MS < deadline) {
        const state = await getAutogenState();
        if (!state?.enabled) return;
        if (slot >= state.workers) return; // concurrency was lowered meanwhile
        if (state.credits_exhausted_at && Date.now() - new Date(state.credits_exhausted_at).getTime() < CREDIT_RETRY_MS) return;

        const type = await pickType(inFlight, state);
        if (!type) return; // the stock target is reached everywhere – the next tick checks again
        inFlight.set(type, (inFlight.get(type) ?? 0) + 1);
        let out;
        try {
          const exam = taskTypeMeta(type)?.exam ?? "osp";
          // maths/logic: now and then a variant of a strong pool task instead of a fresh one (families.ts caps their share)
          const parents = Math.random() < VARIANT_CHANCE ? await variantParents(exam, type, 1) : [];
          out = await generateTasks({ exam, type, count: 1, deadline, parents });
        } finally {
          inFlight.set(type, (inFlight.get(type) ?? 1) - 1);
        }

        if (out.accepted.length && state.credits_exhausted_at) await updateAutogenState({ credits_exhausted_at: null });
        const fatal = out.rejected.find((r) => isFatalApiError(r.reason));
        if (fatal) {
          await updateAutogenState({ credits_exhausted_at: new Date().toISOString(), last_error: fatal.reason.slice(0, 500) });
          return;
        }
        if (out.rejected.some((r) => isRateLimit(r.reason))) await sleep(20_000);
      }
    } catch (e) {
      await updateAutogenState({ last_error: (e instanceof Error ? e.message : String(e)).slice(0, 500) });
    } finally {
      await admin.rpc("autogen_release", { p_slot: slot });
    }
  };

  await Promise.all(slots.map(worker));
}
