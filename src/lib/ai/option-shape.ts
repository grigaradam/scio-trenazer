// How the answer options of a task look, measured against the real Scio tasks of the same type.
//
// Real Scio options never reuse a word across options in fill-in, analogy or synonym tasks: each of the four
// "slovo – slovo – slovo" options brings its own words. Generated tasks sometimes build options combinatorially
// (two candidates per gap, each used twice), which makes the answer solvable by elimination. Every metric here
// is derived from the originals, so a type where real options do share words (maths, reading) is not penalised.
import { taskTypeMeta } from "@/lib/content/exams";
import { groupsOfType } from "@/lib/content/load";
import type { Group, QuestionPart as Part, TaskType } from "@/lib/content/types";

interface OptionShape {
  /** Largest share of option words that appear in more than one option, over all real parts of the type. */
  maxSharedWords: number;
  /** Largest number of gap words reused across "a – b – c" options in a real part. */
  maxSlotReuse: number;
  /** Real multi-gap options always have exactly as many words as the stem has gaps. */
  slotsMatchGaps: boolean;
  /** Real parts with "a – b" options; types with none (maths, tables) get no gap checks. */
  slotted: number;
  parts: number;
}

const strip = (t: string) =>
  t
    .replace(/\$[^$]*\$/g, " ")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase();

/** Option words of 3+ letters; returns the share of distinct words used by 2+ options (0 = every option has its own words). */
export function sharedWordShare(part: Part): number | null {
  if (part.options.length < 2) return null;
  const sets = part.options.map((o) => new Set(strip(o.text).match(/\p{L}{3,}/gu) ?? []));
  const count = new Map<string, number>();
  for (const s of sets) for (const w of s) count.set(w, (count.get(w) ?? 0) + 1);
  if (!count.size) return null;
  return [...count.values()].filter((n) => n > 1).length / count.size;
}

/** Gap words of "a – b – c" options (null when the options are not all split into the same number of ≥ 2 slots). */
export function slotsOf(part: Part): string[][] | null {
  if (part.options.length < 2) return null;
  const slots = part.options.map((o) => o.text.split(/\s+[–—]\s+/).map((s) => strip(s).trim()));
  const n = slots[0].length;
  return n >= 2 && slots.every((s) => s.length === n) ? slots : null;
}

/** Gap words used by more than one option. */
export function reusedSlots(slots: string[][]): string[] {
  const count = new Map<string, number>();
  for (const s of slots) for (const w of new Set(s)) count.set(w, (count.get(w) ?? 0) + 1);
  return [...count].filter(([, n]) => n > 1).map(([w]) => w);
}

const gapsIn = (stem: string) => (stem.match(/_{3,}/g) ?? []).length;

const profiles = new Map<string, OptionShape | null>();

/** Option shape of the real Scio tasks of a type (null = no originals to compare with). */
export function optionShape(type: TaskType): OptionShape | null {
  if (profiles.has(type)) return profiles.get(type)!;
  const meta = taskTypeMeta(type);
  const groups = meta ? groupsOfType(meta.exam, type).map((g) => g.group) : [];
  let maxSharedWords = 0;
  let maxSlotReuse = 0;
  let slotted = 0;
  let matching = 0;
  let parts = 0;
  for (const g of groups)
    for (const q of g.questions)
      for (const p of q.parts) {
        const share = sharedWordShare(p);
        if (share === null) continue;
        parts++;
        maxSharedWords = Math.max(maxSharedWords, share);
        const slots = slotsOf(p);
        if (!slots) continue;
        slotted++;
        maxSlotReuse = Math.max(maxSlotReuse, reusedSlots(slots).length);
        if (gapsIn(q.stem) === slots[0].length) matching++;
      }
  const profile = parts ? { maxSharedWords, maxSlotReuse, slotsMatchGaps: slotted > 0 && matching === slotted, slotted, parts } : null;
  profiles.set(type, profile);
  return profile;
}

/** Ways the options of a group differ from how real Scio options of the type look (empty = OK). */
export function optionShapeIssues(group: Group, type: TaskType): string[] {
  const prof = optionShape(type);
  if (!prof) return [];
  const issues: string[] = [];
  for (const q of group.questions)
    for (const p of q.parts) {
      const slots = prof.slotted ? slotsOf(p) : null;
      if (slots) {
        const reused = reusedSlots(slots);
        if (reused.length > prof.maxSlotReuse)
          issues.push(
            prof.maxSlotReuse === 0
              ? `možnosti: úloha ${q.n} opakuje slova napříč možnostmi (${reused.map((w) => `„${w}“`).join(", ")}) – ve skutečných úlohách Scio má každá možnost svá vlastní slova`
              : `možnosti: úloha ${q.n} opakuje ${reused.length} slov napříč možnostmi, skutečné úlohy nejvýš ${prof.maxSlotReuse}`,
          );
        if (prof.slotsMatchGaps && gapsIn(q.stem) && gapsIn(q.stem) !== slots[0].length)
          issues.push(`možnosti: úloha ${q.n} má ${gapsIn(q.stem)} mezer, ale možnosti po ${slots[0].length} slovech`);
        if (reused.length) continue; // reported once is enough
      }
      const share = sharedWordShare(p);
      // a type whose real options always share words (≥ 0.95) has nothing to measure
      if (share === null || prof.maxSharedWords >= 0.95) continue;
      const limit = prof.maxSharedWords === 0 ? 0 : Math.min(1, prof.maxSharedWords + 0.1);
      if (share > limit + 1e-9)
        issues.push(
          prof.maxSharedWords === 0
            ? `možnosti: úloha ${q.n} má slova společná více možnostem – ve skutečných úlohách Scio se slova mezi možnostmi neopakují`
            : `možnosti: úloha ${q.n} sdílí mezi možnostmi ${Math.round(share * 100)} % slov, skutečné úlohy nejvýš ${Math.round(prof.maxSharedWords * 100)} %`,
        );
    }
  return issues;
}
