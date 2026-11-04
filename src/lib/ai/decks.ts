import { groupsOfType } from "@/lib/content/load";
import type { ExamId, TaskType } from "@/lib/content/types";

// Fixed example decks. The real Scio tasks a prompt shows used to be drawn at random for every candidate, which made
// every prompt unique: it was written to the cache (1.25× price) and never read back. Each type now rotates through a
// few fixed decks – a deck stays the same for an hour, so every candidate of that hour shares one cached prompt
// prefix (read at 5 % of the price), while over a day the generator still sees different originals.

/** How many fixed example sets each task type rotates through. */
export const DECKS = 3;
const HOUR = 3_600_000;

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Deterministic pseudo-random numbers (mulberry32). */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The deck in use right now. Changes every hour, at a different moment for each type. */
export function currentDeck(type: TaskType, at = Date.now()) {
  return (Math.floor(at / HOUR) + hash(type)) % DECKS;
}

/** Real Scio groups usable as examples: no image figures, no excluded questions, no alternative spellings. */
export function exampleGroups(exam: ExamId, type: TaskType) {
  return groupsOfType(exam, type)
    .filter((g) => !g.group.figure && !g.group.questions.some((q) => q.figure || q.excluded || q.parts.some((p) => p.alsoAccepted)))
    .sort((a, b) => `${a.test.id}:${a.group.id}`.localeCompare(`${b.test.id}:${b.group.id}`));
}

/**
 * The `count` example groups of a deck – always the same ones for the same deck. Decks are consecutive slices of one
 * fixed shuffle, so they don't overlap while the type has enough originals. The generator and the validator use
 * different shuffles (`purpose`), so the validator judges against other originals than the generator imitated.
 */
export function deckGroups(exam: ExamId, type: TaskType, deck: number, count: number, purpose: "gen" | "val") {
  const all = exampleGroups(exam, type);
  const rnd = seeded(hash(`${purpose}:${type}`));
  const order = all
    .map((g) => ({ g, r: rnd() }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.g);
  const picked = new Set<(typeof order)[number]>();
  for (let i = 0; picked.size < Math.min(count, order.length); i++) picked.add(order[(deck * count + i) % order.length]);
  return [...picked];
}
