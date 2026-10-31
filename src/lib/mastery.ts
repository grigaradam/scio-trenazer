// "Zvládnutí" of a task type: an encouraging score that follows what you can do now,
// not your all-time average.
// - recent answers count most (old mistakes fade out, half the weight every HALF_LIFE answers)
// - a mistake you later fixed counts as half right – you learned from it
// - it starts at 50 % and needs a few answers to move far, so one bad task can't crash it

const HALF_LIFE = 30; // answers
const PRIOR_WEIGHT = 4; // answers' worth of the 50 % starting point

export interface MasteryItem {
  /** when it was answered (ms) */
  at: number;
  /** how many questions this item stands for (1 for a practice answer, the bucket size for a test) */
  n: number;
  /** points out of n */
  right: number;
}

export function mastery(items: MasteryItem[]): number | null {
  if (!items.length) return null;
  const sorted = [...items].sort((a, b) => b.at - a.at);
  let k = 0;
  let weight = 0;
  let right = 0;
  for (const it of sorted) {
    if (it.n <= 0) continue;
    const w = it.n * 0.5 ** ((k + it.n / 2) / HALF_LIFE);
    weight += w;
    right += w * Math.min(1, it.right / it.n);
    k += it.n;
  }
  if (!weight) return null;
  return (right + PRIOR_WEIGHT * 0.5) / (weight + PRIOR_WEIGHT);
}

/** Change over the last week (null when nothing new was answered or there was nothing before). */
export function masteryTrend(items: MasteryItem[], now: number, days = 7): number | null {
  const cut = now - days * 86400000;
  const before = items.filter((i) => i.at < cut);
  if (before.length === items.length) return null;
  const was = mastery(before);
  const is = mastery(items);
  return was === null || is === null ? null : is - was;
}

export const MASTERY_LEVELS: { min: number; label: string; bar: string }[] = [
  { min: 0.8, label: "Mistr", bar: "bg-emerald-500" },
  { min: 0.65, label: "Jde ti to", bar: "bg-emerald-400" },
  { min: 0.5, label: "Zlepšuješ se", bar: "bg-sky-500" },
  { min: 0.35, label: "Rozjíždíš se", bar: "bg-amber-400" },
  { min: 0, label: "Začínáš", bar: "bg-orange-400" },
];

export const masteryLevel = (m: number) => MASTERY_LEVELS.find((l) => m >= l.min) ?? MASTERY_LEVELS[MASTERY_LEVELS.length - 1];
