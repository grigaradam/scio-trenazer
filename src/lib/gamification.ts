// XP, levels and achievements. Pure definitions; the server awards them.

export const XP = {
  practiceCorrect: 15, // first correct answer: worth the most
  practiceWrong: 2,
  fastBonus: 3, // answered correctly within half the time limit
  mistakeFixed: 10, // correct answer to an open mistake: replaces practiceCorrect
  testCompleted: 100,
  testPerPoint: 2,
};

/** Cumulative XP needed to reach a level: L2 = 100, L3 = 300, L4 = 600, L5 = 1000 … */
export const levelThreshold = (level: number) => 50 * (level - 1) * level;

export function levelInfo(xp: number) {
  let level = 1;
  while (xp >= levelThreshold(level + 1)) level++;
  const from = levelThreshold(level);
  const to = levelThreshold(level + 1);
  return { level, from, to, progress: (xp - from) / (to - from), toNext: to - xp };
}

export const LEVEL_TITLES = [
  "Nováček",
  "Zvědavec",
  "Řešitel",
  "Počtář",
  "Logik",
  "Analytik",
  "Stratég",
  "Expert",
  "Mistr OSP",
  "Legenda",
];
export const levelTitle = (level: number) => LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)];

export interface AchievementStats {
  testsCompleted: number;
  bestPercent: number;
  bestPercentile: number;
  perfectSection: boolean;
  streakBest: number;
  practiceTotal: number;
  practiceCorrectInRow: number;
  mistakesFixed: number;
  totalSeconds: number;
  typesPracticed: number;
  hour: number;
  improvedTest: boolean;
}

export type AchievementCategory = "tests" | "score" | "practice" | "mistakes" | "streak" | "habits";

export const ACHIEVEMENT_CATEGORIES: { code: AchievementCategory; title: string; emoji: string; hint: string }[] = [
  { code: "tests", title: "Testy nanečisto", emoji: "📝", hint: "Celé testy na čas, jako u ostré zkoušky." },
  { code: "score", title: "Výsledky", emoji: "🎯", hint: "Body a percentil v testech." },
  { code: "practice", title: "Trénink", emoji: "💪", hint: "Úlohy v tréninku a série správných odpovědí." },
  { code: "mistakes", title: "Práce s chybami", emoji: "🛠️", hint: "Oprav úlohy, které ti předtím nevyšly." },
  { code: "streak", title: "Pravidelnost", emoji: "🔥", hint: "Uč se každý den a drž streak." },
  { code: "habits", title: "Čas a zvyky", emoji: "⏳", hint: "Nasbíraný čas učení a pár zvláštností." },
];

export interface AchievementDef {
  code: string;
  title: string;
  description: string;
  emoji: string;
  category: AchievementCategory;
  /** XP awarded once, when the achievement unlocks */
  xp: number;
  /** unlocked when value(stats) >= target; target 1 = a yes/no achievement */
  target: number;
  value: (s: AchievementStats) => number;
  /** how the current state reads, e.g. "4 / 10 dní" */
  unit?: string;
}

const yes = (b: boolean) => (b ? 1 : 0);
const hours = (s: AchievementStats) => Math.floor(s.totalSeconds / 360) / 10;

export const ACHIEVEMENTS: AchievementDef[] = [
  // tests
  { code: "first_test", category: "tests", xp: 50, title: "První krok", description: "Dokonči první celý test.", emoji: "🎯", target: 1, value: (s) => s.testsCompleted },
  { code: "tests_3", category: "tests", xp: 75, title: "Zahřátý", description: "Dokonči 3 celé testy.", emoji: "🧭", target: 3, value: (s) => s.testsCompleted, unit: "testů" },
  { code: "tests_5", category: "tests", xp: 100, title: "Vytrvalec", description: "Dokonči 5 celých testů.", emoji: "🏃", target: 5, value: (s) => s.testsCompleted, unit: "testů" },
  { code: "tests_10", category: "tests", xp: 200, title: "Všechny testy", description: "Dokonči 10 celých testů.", emoji: "🏆", target: 10, value: (s) => s.testsCompleted, unit: "testů" },
  { code: "improved", category: "tests", xp: 50, title: "Posun vpřed", description: "Zlepši se oproti minulému testu.", emoji: "⬆️", target: 1, value: (s) => yes(s.improvedTest) },
  // score
  { code: "half", category: "score", xp: 50, title: "Nad průměrem", description: "Získej v testu aspoň 50 % bodů.", emoji: "📈", target: 50, value: (s) => Math.round(s.bestPercent), unit: "%" },
  { code: "seventy", category: "score", xp: 100, title: "Silná sedmdesátka", description: "Získej v testu aspoň 70 % bodů.", emoji: "🚀", target: 70, value: (s) => Math.round(s.bestPercent), unit: "%" },
  { code: "p90", category: "score", xp: 200, title: "Top 10 %", description: "Odhadovaný percentil aspoň 90.", emoji: "👑", target: 90, value: (s) => Math.round(s.bestPercentile), unit: "percentil" },
  { code: "perfect_section", category: "score", xp: 100, title: "Bez chyby", description: "Celý oddíl testu bez jediné chyby.", emoji: "💎", target: 1, value: (s) => yes(s.perfectSection) },
  // practice
  { code: "practice_10", category: "practice", xp: 20, title: "Rozehřívačka", description: "Vyřeš 10 tréninkových úloh.", emoji: "🌱", target: 10, value: (s) => s.practiceTotal, unit: "úloh" },
  { code: "practice_50", category: "practice", xp: 50, title: "Rozcvička", description: "Vyřeš 50 tréninkových úloh.", emoji: "💪", target: 50, value: (s) => s.practiceTotal, unit: "úloh" },
  { code: "practice_250", category: "practice", xp: 150, title: "Dříč", description: "Vyřeš 250 tréninkových úloh.", emoji: "🏋️", target: 250, value: (s) => s.practiceTotal, unit: "úloh" },
  { code: "practice_1000", category: "practice", xp: 400, title: "Stroj na úlohy", description: "Vyřeš 1000 tréninkových úloh.", emoji: "🤖", target: 1000, value: (s) => s.practiceTotal, unit: "úloh" },
  { code: "row_5", category: "practice", xp: 25, title: "Na vlně", description: "5 správných odpovědí v řadě.", emoji: "🌊", target: 5, value: (s) => s.practiceCorrectInRow, unit: "v řadě" },
  { code: "row_10", category: "practice", xp: 60, title: "Série", description: "10 správných odpovědí v řadě.", emoji: "⚡", target: 10, value: (s) => s.practiceCorrectInRow, unit: "v řadě" },
  { code: "row_25", category: "practice", xp: 150, title: "Neomylný", description: "25 správných odpovědí v řadě.", emoji: "🎖️", target: 25, value: (s) => s.practiceCorrectInRow, unit: "v řadě" },
  { code: "all_types", category: "practice", xp: 100, title: "Všestranný", description: "Trénuj všech 13 typů úloh.", emoji: "🌈", target: 13, value: (s) => s.typesPracticed, unit: "typů" },
  // mistakes
  { code: "fix_1", category: "mistakes", xp: 15, title: "První oprava", description: "Oprav svou první chybu.", emoji: "🩹", target: 1, value: (s) => s.mistakesFixed },
  { code: "fix_10", category: "mistakes", xp: 50, title: "Opravář", description: "Oprav 10 chyb.", emoji: "🛠️", target: 10, value: (s) => s.mistakesFixed, unit: "chyb" },
  { code: "fix_50", category: "mistakes", xp: 150, title: "Z chyb se učím", description: "Oprav 50 chyb.", emoji: "🧰", target: 50, value: (s) => s.mistakesFixed, unit: "chyb" },
  { code: "fix_100", category: "mistakes", xp: 300, title: "Mistr oprav", description: "Oprav 100 chyb.", emoji: "🏗️", target: 100, value: (s) => s.mistakesFixed, unit: "chyb" },
  // streak
  { code: "streak_3", category: "streak", xp: 30, title: "Rozjezd", description: "Streak 3 dny v řadě.", emoji: "🔥", target: 3, value: (s) => s.streakBest, unit: "dní" },
  { code: "streak_7", category: "streak", xp: 75, title: "Týden v kuse", description: "Streak 7 dní v řadě.", emoji: "📅", target: 7, value: (s) => s.streakBest, unit: "dní" },
  { code: "streak_14", category: "streak", xp: 150, title: "Dva týdny", description: "Streak 14 dní v řadě.", emoji: "☄️", target: 14, value: (s) => s.streakBest, unit: "dní" },
  { code: "streak_30", category: "streak", xp: 300, title: "Měsíc disciplíny", description: "Streak 30 dní v řadě.", emoji: "🌋", target: 30, value: (s) => s.streakBest, unit: "dní" },
  // habits
  { code: "hours_1", category: "habits", xp: 25, title: "První hodina", description: "Nauč se celkem 1 hodinu.", emoji: "⏱️", target: 1, value: hours, unit: "h" },
  { code: "hours_10", category: "habits", xp: 150, title: "10 hodin", description: "Nauč se celkem 10 hodin.", emoji: "⏳", target: 10, value: hours, unit: "h" },
  { code: "hours_50", category: "habits", xp: 400, title: "Padesátka", description: "Nauč se celkem 50 hodin.", emoji: "🧠", target: 50, value: hours, unit: "h" },
  { code: "night_owl", category: "habits", xp: 25, title: "Noční sova", description: "Uč se po 23. hodině.", emoji: "🦉", target: 1, value: (s) => yes(s.hour >= 23) },
  { code: "early_bird", category: "habits", xp: 25, title: "Ranní ptáče", description: "Uč se před 7. hodinou ranní.", emoji: "🐦", target: 1, value: (s) => yes(s.hour >= 4 && s.hour < 7) },
];

export const achievementDef = (code: string) => ACHIEVEMENTS.find((a) => a.code === code);
export const achievementDone = (a: AchievementDef, s: AchievementStats) => a.value(s) >= a.target;

/** The new level when going from xp `before` to `after` crossed a threshold, else null. */
export function levelUp(before: number, after: number): number | null {
  const a = levelInfo(before).level;
  const b = levelInfo(after).level;
  return b > a ? b : null;
}

export const LEVEL_EMOJIS = ["🐣", "🔎", "🧩", "🧮", "🧠", "📊", "♟️", "🎓", "🏅", "🌟"];
export const levelEmoji = (level: number) => LEVEL_EMOJIS[Math.min(level - 1, LEVEL_EMOJIS.length - 1)];
