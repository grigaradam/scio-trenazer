import "server-only";
import { taskTypeMeta } from "@/lib/content/exams";
import type { TaskType } from "@/lib/content/types";
import { AI } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { anthropic } from "./client";
import { logAiCall } from "./usage";

// Self-improving generator: every validator rejection is logged (ai_calls kind "reject", note "<type>: <reason>").
// Rejections are periodically distilled into short, concrete rules per task type (generator_lessons),
// which are fed back into the generator prompt together with the latest raw reasons.

/** Distill new lessons after this many new rejections of a type. */
const REFRESH_AFTER = 3;
// Hard size caps – lessons are rewritten (never appended), so the prompt can't grow over time.
const MAX_LESSON_CHARS = 1200; // ≈ 350 tokens
const MAX_RECENT = 3;
const MAX_RECENT_CHARS = 250;
const MAX_DISTILL_INPUT = 20;

const stripType = (note: string, type: string) => note.replace(new RegExp(`^${type}:\\s*`), "");

/**
 * Rejections before this moment were judged by older validator rules (stricter difficulty bar,
 * synonym answers counted wrong by a bug) – they no longer steer the generator.
 */
const CRITERIA_EPOCH = "2026-10-22T21:34:00Z"; // deploy of the fixed validator
/** Lessons distilled from bad data are discarded per type and re-learned from fresh rejections. */
const LESSON_RESET: Partial<Record<TaskType, string>> = { synonyma: CRITERIA_EPOCH };

export interface Lessons {
  lessons: string | null;
  recent: string[];
}

export async function getLessons(type: TaskType): Promise<Lessons> {
  const admin = createAdminClient();
  const [lessonRes, recentRes] = await Promise.all([
    admin.from("generator_lessons").select("lessons,updated_at").eq("task_type", type).maybeSingle(),
    admin
      .from("ai_calls")
      .select("note")
      .eq("kind", "reject")
      .like("note", `${type}:%`)
      .gte("created_at", CRITERIA_EPOCH)
      .order("created_at", { ascending: false })
      .limit(MAX_RECENT),
  ]);
  const reset = LESSON_RESET[type];
  const stale = Boolean(reset && lessonRes.data?.updated_at && (lessonRes.data.updated_at as string) < reset);
  return {
    lessons:
      lessonRes.error || stale ? null : (((lessonRes.data?.lessons as string | undefined) ?? "").slice(0, MAX_LESSON_CHARS) || null),
    recent: recentRes.error
      ? []
      : ((recentRes.data ?? []) as { note: string | null }[])
          .map((r) => (r.note ? stripType(r.note, type).slice(0, MAX_RECENT_CHARS) : ""))
          .filter(Boolean),
  };
}

/** Prompt block with what the generator must avoid this time. */
export function lessonsBlock(l: Lessons | null) {
  if (!l || (!l.lessons && !l.recent.length)) return "";
  return `
POUČENÍ Z DŘÍVĚJŠÍCH ZAMÍTNUTÍ TOHOTO TYPU (validátor tyto chyby zamítá – vyhni se jim):
${l.lessons ?? ""}
${l.recent.length ? `Poslední konkrétní důvody zamítnutí:\n- ${l.recent.join("\n- ")}` : ""}
`;
}

/** Re-distills the lessons for a type when enough new rejections have accumulated. */
export async function refreshLessons(type: TaskType) {
  const admin = createAdminClient();
  const meta = taskTypeMeta(type);
  const { data: current, error: lessonErr } = await admin
    .from("generator_lessons")
    .select("lessons,updated_at")
    .eq("task_type", type)
    .maybeSingle();
  if (lessonErr) return; // migration 0004 not applied yet
  const reset = LESSON_RESET[type];
  const stale = Boolean(reset && current?.updated_at && (current.updated_at as string) < reset);
  const since = !current?.updated_at || stale ? CRITERIA_EPOCH : (current.updated_at as string);

  const newQuery = admin
    .from("ai_calls")
    .select("id", { count: "exact", head: true })
    .eq("kind", "reject")
    .like("note", `${type}:%`)
    .gte("created_at", since > CRITERIA_EPOCH ? since : CRITERIA_EPOCH);
  const { count } = await newQuery;
  if ((count ?? 0) < REFRESH_AFTER) return;

  const [{ data: rejects }, { count: accepted }] = await Promise.all([
    admin
      .from("ai_calls")
      .select("note")
      .eq("kind", "reject")
      .like("note", `${type}:%`)
      .gte("created_at", CRITERIA_EPOCH)
      .order("created_at", { ascending: false })
      .limit(MAX_DISTILL_INPUT),
    admin.from("ai_calls").select("id", { count: "exact", head: true }).eq("kind", "accept").like("note", `${type}:%`),
  ]);
  const reasons = ((rejects ?? []) as { note: string | null }[]).map((r) => `- ${stripType(r.note ?? "", type).slice(0, 300)}`);
  if (!reasons.length) return;

  const response = await anthropic().messages.create({
    model: AI.validatorModel,
    max_tokens: 3000,
    output_config: { effort: "low" },
    system:
      "Jsi editor, který zlepšuje AI generátor úloh pro test OSP (Scio). Z důvodů, proč validátor úlohy zamítl, " +
      "sestav krátký seznam konkrétních, akčních pravidel pro generátor, aby se stejné chyby už neopakovaly. " +
      "Pravidla piš česky jako odrážky „- …“, každé 1 krátká věta, MAX. 8 odrážek a celkem max. 1000 znaků. " +
      "Výsledek NAHRAZUJE dosavadní pravidla: zachovej jen ta, která stále platí, slouč duplicity, " +
      "nejčastější problémy dej nahoru, méně důležité vyřaď. Žádný úvod ani závěr.",
    messages: [
      {
        role: "user",
        content: `Typ úlohy: ${meta?.name ?? type}
Přijatých úloh zatím: ${accepted ?? 0}

Dosavadní pravidla:
${stale ? "(zatím žádná)" : ((current?.lessons as string | undefined) ?? "(zatím žádná)")}

Poslední důvody zamítnutí (nejnovější nahoře):
${reasons.join("\n")}`,
      },
    ],
  });
  await logAiCall({ kind: "learn", model: AI.validatorModel, usage: response.usage });
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .trim()
    .slice(0, MAX_LESSON_CHARS);
  if (!text) return;
  await admin
    .from("generator_lessons")
    .upsert({ task_type: type, lessons: text, rejects_seen: reasons.length, updated_at: new Date().toISOString() });
}
