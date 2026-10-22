import "server-only";
import { GENERATOR_VERSION, generateTasks } from "@/lib/ai/generate";
import { TASK_TYPES } from "@/lib/content/exams";
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

/** The task type with the fewest current-version tasks in the pool (ties broken randomly). */
async function pickType(inFlight: Map<string, number>): Promise<TaskType> {
  const { data } = await createAdminClient().from("generated_tasks").select("task_type,v:payload->v").eq("exam", "osp");
  const counts = new Map<string, number>(TASK_TYPES.filter((t) => t.exam === "osp").map((t) => [t.id, 0]));
  for (const r of (data ?? []) as { task_type: string; v?: number | null }[]) {
    if (counts.has(r.task_type) && Number(r.v ?? 1) >= GENERATOR_VERSION) counts.set(r.task_type, counts.get(r.task_type)! + 1);
  }
  for (const [t, n] of inFlight) counts.set(t, (counts.get(t) ?? 0) + n);
  const min = Math.min(...counts.values());
  const lowest = [...counts].filter(([, n]) => n === min).map(([t]) => t);
  return lowest[Math.floor(Math.random() * lowest.length)] as TaskType;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs the claimed worker slots in parallel until the time budget is used up. */
export async function runAutogen(slots: number[]) {
  const admin = createAdminClient();
  const deadline = Date.now() + RUN_MS;
  const inFlight = new Map<string, number>();

  const worker = async (slot: number) => {
    try {
      while (Date.now() + MIN_TASK_MS < deadline) {
        const state = await getAutogenState();
        if (!state?.enabled) return;
        if (slot >= state.workers) return; // concurrency was lowered meanwhile
        if (state.credits_exhausted_at && Date.now() - new Date(state.credits_exhausted_at).getTime() < CREDIT_RETRY_MS) return;

        const type = await pickType(inFlight);
        inFlight.set(type, (inFlight.get(type) ?? 0) + 1);
        let out;
        try {
          out = await generateTasks({ exam: "osp", type, count: 1, deadline });
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
