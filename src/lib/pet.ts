// The study pet. Everything is derived from what the student already does (XP, level, streak,
// today's tasks and minutes, achievements) – the pet has no state of its own except the name
// and the chosen outfit, which live in the browser.

import { levelInfo, levelThreshold } from "./gamification";

export const PET_DEFAULT_NAME = "Bystrouš";

// ---------------------------------------------------------------- growth (by level)

export interface PetStage {
  code: "egg" | "baby" | "kid" | "teen" | "sage" | "legend";
  /** first level of this stage */
  level: number;
  title: string;
  description: string;
}

export const PET_STAGES: PetStage[] = [
  { code: "egg", level: 1, title: "Vajíčko", description: "Něco se v něm hýbe. Nasbírej XP a vylíhne se." },
  { code: "baby", level: 2, title: "Mládě", description: "Čerstvě vylíhnuté, zvědavé a pořád hladové." },
  { code: "kid", level: 4, title: "Malý bystrouš", description: "Narostla mu ouška a ocásek. Učí se s tebou." },
  { code: "teen", level: 6, title: "Dospívající", description: "Má křidélka a první velké ambice." },
  { code: "sage", level: 8, title: "Mudrc", description: "Rozumí logice i češtině skoro jako ty." },
  { code: "legend", level: 10, title: "Legenda", description: "Září. Spolu jste to dotáhli až na vrchol." },
];

export function petStage(level: number) {
  let i = 0;
  while (i + 1 < PET_STAGES.length && level >= PET_STAGES[i + 1].level) i++;
  return { stage: PET_STAGES[i], index: i, next: PET_STAGES[i + 1] ?? null };
}

/** XP progress towards the next transformation (null at the last stage). */
export function petGrowth(xp: number) {
  const { level } = levelInfo(xp);
  const { stage, next } = petStage(level);
  if (!next) return null;
  const from = levelThreshold(stage.level);
  const to = levelThreshold(next.level);
  return { next, progress: Math.min(1, (xp - from) / (to - from)), toNext: Math.max(0, to - xp) };
}

// ---------------------------------------------------------------- needs (by today's study)

/** One solved task = one snack; this many fill the bowl for the day. */
export const PET_FOOD_PER_DAY = 10;

export interface PetInput {
  xp: number;
  streak: number;
  /** whole days since the last day with a solved task (0 = today, null = never) */
  idleDays: number | null;
  todayTasks: number;
  todayMinutes: number;
  goalMinutes: number;
  /** achievements unlocked in the last 7 days */
  recentAchievements: number;
}

export type PetMood = "ecstatic" | "happy" | "ok" | "tired" | "hungry" | "sad" | "asleep";

export interface PetNeeds {
  hunger: number; // 0 = starving, 1 = full
  energy: number;
  joy: number;
}

export interface PetState extends PetNeeds {
  mood: PetMood;
  message: string;
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));

export function petState(p: PetInput): PetState {
  const hunger = clamp(p.todayTasks / PET_FOOD_PER_DAY);
  const energy = clamp(p.todayMinutes / Math.max(1, p.goalMinutes));
  // a living streak and fresh achievements make it happy; it never drops to zero while you show up
  const joy = clamp((p.idleDays === 0 || p.idleDays === 1 ? 0.25 : 0) + Math.min(p.streak, 7) * 0.07 + Math.min(p.recentAchievements, 3) * 0.1);
  const avg = (hunger + energy + joy) / 3;

  let mood: PetMood;
  if (p.idleDays === null || p.idleDays >= 3) mood = "asleep";
  else if (p.idleDays >= 1) mood = p.idleDays >= 2 ? "sad" : "hungry";
  else if (avg >= 0.8) mood = "ecstatic";
  else if (hunger < 0.3) mood = "hungry";
  else if (energy < 0.25) mood = "tired";
  else if (avg >= 0.5) mood = "happy";
  else mood = "ok";

  return { hunger, energy, joy, mood, message: petMessage(mood, p, hunger, energy) };
}

function petMessage(mood: PetMood, p: PetInput, hunger: number, energy: number): string {
  const snacks = Math.max(0, PET_FOOD_PER_DAY - p.todayTasks);
  switch (mood) {
    case "asleep":
      return p.idleDays === null ? "Zahřej mě první úlohou, ať se můžu vylíhnout…" : "Zzz… stýskalo se mi. Vzbudíš mě jednou úlohou?";
    case "sad":
      return "Dva dny bez učení… je mi smutno. Pojďme spolu aspoň na pár úloh.";
    case "hungry":
      return p.idleDays === 0
        ? `Mňam, to bylo dobré! Ještě ${snacks} ${snacks === 1 ? "úloha" : snacks < 5 ? "úlohy" : "úloh"} a budu úplně sytý.`
        : p.streak > 0
          ? `Kručí mi v bříšku! Vyřeš dnes úlohu, ať nepřijdeme o ${p.streak}denní streak.`
          : "Kručí mi v bříšku! Dáš mi dnes nějakou úlohu?";
    case "tired":
      return "Úáách… zívám. Pár minut učení a zase budu čilý!";
    case "ok":
      return energy < 1 ? "Je mi fajn. Ještě chvilku učení a budu nabitý energií!" : "Díky za jídlo! Dáme ještě pár úloh?";
    case "happy":
      return hunger >= 1 ? "Jsem sytý jak koblížek! Ještě splnit denní cíl a jsem v sedmém nebi." : "Tohle je super den! Ještě pár úloh a budu přecpaný.";
    case "ecstatic":
      return "Jsem nejšťastnější mazlíček na světě! 💖 Zítra zase?";
  }
}

// ---------------------------------------------------------------- outfit (by achievements)

export type PetSlot = "head" | "face" | "neck" | "back" | "hand";

export interface PetItem {
  code: string;
  name: string;
  emoji: string;
  slot: PetSlot;
  /** the achievement that unlocks it */
  achievement: string;
}

export const PET_ITEMS: PetItem[] = [
  { code: "flower", name: "Kytička", emoji: "🌼", slot: "head", achievement: "streak_3" },
  { code: "bow", name: "Mašle", emoji: "🎀", slot: "head", achievement: "fix_10" },
  { code: "cap", name: "Absolventská čepice", emoji: "🎓", slot: "head", achievement: "tests_5" },
  { code: "crown", name: "Koruna", emoji: "👑", slot: "head", achievement: "p90" },
  { code: "glasses", name: "Brýle chytráka", emoji: "👓", slot: "face", achievement: "practice_250" },
  { code: "shades", name: "Sluneční brýle", emoji: "🕶️", slot: "face", achievement: "row_10" },
  { code: "scarf", name: "Šála", emoji: "🧣", slot: "neck", achievement: "streak_7" },
  { code: "medal", name: "Medaile", emoji: "🏅", slot: "neck", achievement: "seventy" },
  // the harder ones
  { code: "headphones", name: "Sluchátka", emoji: "🎧", slot: "head", achievement: "hours_10" },
  { code: "wizard", name: "Kouzelnický klobouk", emoji: "🧙", slot: "head", achievement: "hours_50" },
  { code: "halo", name: "Svatozář", emoji: "😇", slot: "head", achievement: "streak_30" },
  { code: "monocle", name: "Monokl", emoji: "🧐", slot: "face", achievement: "fix_100" },
  { code: "bowtie", name: "Motýlek", emoji: "🤵", slot: "neck", achievement: "fix_50" },
  { code: "cape", name: "Hrdinský plášť", emoji: "🦸", slot: "back", achievement: "row_25" },
  { code: "book", name: "Kniha moudrosti", emoji: "📖", slot: "hand", achievement: "practice_1000" },
  { code: "trophy", name: "Pohár", emoji: "🏆", slot: "hand", achievement: "tests_10" },
];

export type PetOutfit = Partial<Record<PetSlot, string | null>>;

/** Without a saved choice the pet wears the best item it has in each slot. */
export function defaultOutfit(unlocked: Set<string>): PetOutfit {
  const out: PetOutfit = {};
  for (const item of PET_ITEMS) if (unlocked.has(item.achievement)) out[item.slot] = item.code;
  return out;
}
