import "server-only";
import type { ExamId, Group, TaskType } from "@/lib/content/types";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Served } from "./variety";
import { GENERATOR_VERSION } from "./version";

// ------------------------------------------------------------------ easy tasks
// A task the validator found correct and unambiguous, only easier than real Scio, used to be thrown away. Now it may
// join the pool – for everyone, whatever the plan – but easy tasks stay a small minority: at most EASY_SHARE of a
// type's pool, and a user gets at most one easy task in every EASY_WINDOW tasks of a type.
export const EASY_SHARE = 0.1;
export const EASY_WINDOW = 10;

// ------------------------------------------------------------------ variant families
// Maths and logic only: a cheap model re-skins a high-quality validated task – same principle and trap, new numbers
// and context – and the validator checks the variant like any other task. Variants stay a minority (VARIANT_SHARE of
// a type's pool, at most FAMILY_MAX tasks per family) and a user meets another member of a family only after
// FAMILY_GAP_DAYS and FAMILY_GAP_TASKS other tasks of the type: long enough to forget the task itself, while the
// principle it trains comes back (spaced practice).
export const VARIANT_TYPES: TaskType[] = ["porovnani", "dostatecnost", "slovni", "vyrazy", "data", "podminky"];
export const FAMILY_MAX = 3;
export const VARIANT_SHARE = 0.25;
export const PARENT_MIN_QUALITY = 8.5;
export const FAMILY_GAP_DAYS = 7;
export const FAMILY_GAP_TASKS = 15;

/** A pool task a variant is derived from. The variant prompt shows it with its key and trap analysis. */
export interface ParentTask {
  id: string;
  /** Family the variant joins (the parent's own id – parents are always original tasks). */
  family: string;
  group: Group;
  topic: string;
  focus: string[];
  trapDesign: string[];
}

type StockRow = {
  id: string;
  quality: number | null;
  v: number | null;
  easy: boolean | null;
  family: string | null;
  variantOf: string | null;
};

/** Current-version pool tasks of a type with the fields the share rules need. */
async function stock(exam: ExamId, type: TaskType) {
  const { data } = await createAdminClient()
    .from("generated_tasks")
    .select("id,quality,v:payload->v,easy:payload->easy,family:payload->>family,variantOf:payload->>variantOf")
    .eq("exam", exam)
    .eq("task_type", type);
  return ((data ?? []) as StockRow[]).filter((r) => Number(r.v ?? 1) >= GENERATOR_VERSION);
}

/** Is there room for one more easy task of this type (easy tasks ≤ EASY_SHARE of the pool)? */
export async function easyAllowed(exam: ExamId, type: TaskType) {
  const rows = await stock(exam, type);
  const easy = rows.filter((r) => r.easy === true).length;
  return easy + 1 <= EASY_SHARE * (rows.length + 1);
}

/**
 * Up to `max` parents for new variants: high-quality original tasks (not easy, not variants themselves) whose family
 * still has room, smallest families first. `inFlight` = variants of a parent already being generated.
 */
export async function variantParents(exam: ExamId, type: TaskType, max: number, inFlight = new Map<string, number>()): Promise<ParentTask[]> {
  if (!VARIANT_TYPES.includes(type) || max <= 0) return [];
  const rows = await stock(exam, type);
  const variants = rows.filter((r) => r.variantOf).length + [...inFlight.values()].reduce((a, b) => a + b, 0);
  const room = Math.floor(VARIANT_SHARE * rows.length) - variants;
  if (room <= 0) return [];
  const members = new Map<string, number>();
  for (const r of rows) members.set(r.family ?? r.id, (members.get(r.family ?? r.id) ?? 0) + 1);
  const candidates = rows
    .filter((r) => !r.variantOf && r.easy !== true && Number(r.quality ?? 0) >= PARENT_MIN_QUALITY)
    .map((r) => ({ id: r.id, size: (members.get(r.id) ?? 1) + (inFlight.get(r.id) ?? 0) }))
    .filter((c) => c.size < FAMILY_MAX)
    .sort(() => Math.random() - 0.5)
    .sort((a, b) => a.size - b.size);
  const chosen = candidates.slice(0, Math.min(max, room)).map((c) => c.id);
  if (!chosen.length) return [];
  const { data } = await createAdminClient().from("generated_tasks").select("id,payload").in("id", chosen);
  return ((data ?? []) as { id: string; payload: Group & { topic?: string; focus?: string[]; trapDesign?: string[] } }[]).map((r) => ({
    id: r.id,
    family: r.id,
    group: r.payload,
    topic: r.payload.topic ?? "",
    focus: r.payload.focus ?? [],
    trapDesign: r.payload.trapDesign ?? [],
  }));
}

/**
 * May the user get a task of this family now? Only after FAMILY_GAP_TASKS other tasks of the type and
 * FAMILY_GAP_DAYS since they last met a member of it. `history` is newest first.
 */
export function familyAllowed(family: string, history: Served[], now = Date.now()) {
  const i = history.findIndex((h) => h.family === family);
  if (i < 0) return true;
  return i >= FAMILY_GAP_TASKS && now - Date.parse(history[i].at) >= FAMILY_GAP_DAYS * 86_400_000;
}

/** Did the user get an easy task within their last EASY_WINDOW − 1 tasks of the type? Then the next easy one waits. */
export const easyRecently = (history: Served[]) => history.slice(0, EASY_WINDOW - 1).some((h) => h.easy);
