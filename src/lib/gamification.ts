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

export interface AchievementDef {
  code: string;
  title: string;
  description: string;
  emoji: string;
  check: (s: AchievementStats) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { code: "first_test", title: "První krok", description: "Dokonči první celý test.", emoji: "🎯", check: (s) => s.testsCompleted >= 1 },
  { code: "tests_5", title: "Vytrvalec", description: "Dokonči 5 celých testů.", emoji: "🏃", check: (s) => s.testsCompleted >= 5 },
  { code: "tests_10", title: "Všechny testy", description: "Dokonči 10 celých testů.", emoji: "🏆", check: (s) => s.testsCompleted >= 10 },
  { code: "half", title: "Nad průměrem", description: "Získej v testu aspoň 50 % bodů.", emoji: "📈", check: (s) => s.bestPercent >= 50 },
  { code: "seventy", title: "Silná sedmdesátka", description: "Získej v testu aspoň 70 % bodů.", emoji: "🚀", check: (s) => s.bestPercent >= 70 },
  { code: "p90", title: "Top 10 %", description: "Odhadovaný percentil aspoň 90.", emoji: "👑", check: (s) => s.bestPercentile >= 90 },
  { code: "perfect_section", title: "Bez chyby", description: "Celý oddíl bez jediné chyby.", emoji: "💎", check: (s) => s.perfectSection },
  { code: "improved", title: "Posun vpřed", description: "Zlepši se oproti minulému testu.", emoji: "⬆️", check: (s) => s.improvedTest },
  { code: "streak_3", title: "Rozjezd", description: "Streak 3 dny v řadě.", emoji: "🔥", check: (s) => s.streakBest >= 3 },
  { code: "streak_7", title: "Týden v kuse", description: "Streak 7 dní v řadě.", emoji: "🔥", check: (s) => s.streakBest >= 7 },
  { code: "streak_30", title: "Měsíc disciplíny", description: "Streak 30 dní v řadě.", emoji: "🌋", check: (s) => s.streakBest >= 30 },
  { code: "practice_50", title: "Rozcvička", description: "Vyřeš 50 tréninkových úloh.", emoji: "💪", check: (s) => s.practiceTotal >= 50 },
  { code: "practice_250", title: "Dříč", description: "Vyřeš 250 tréninkových úloh.", emoji: "🏋️", check: (s) => s.practiceTotal >= 250 },
  { code: "practice_1000", title: "Stroj na úlohy", description: "Vyřeš 1000 tréninkových úloh.", emoji: "🤖", check: (s) => s.practiceTotal >= 1000 },
  { code: "row_10", title: "Série", description: "10 správných odpovědí v řadě.", emoji: "⚡", check: (s) => s.practiceCorrectInRow >= 10 },
  { code: "fix_10", title: "Opravář", description: "Oprav 10 chyb.", emoji: "🛠️", check: (s) => s.mistakesFixed >= 10 },
  { code: "fix_50", title: "Z chyb se učím", description: "Oprav 50 chyb.", emoji: "🧰", check: (s) => s.mistakesFixed >= 50 },
  { code: "hours_10", title: "10 hodin", description: "Nauč se celkem 10 hodin.", emoji: "⏳", check: (s) => s.totalSeconds >= 36000 },
  { code: "all_types", title: "Všestranný", description: "Trénuj všech 13 typů úloh.", emoji: "🌈", check: (s) => s.typesPracticed >= 13 },
  { code: "night_owl", title: "Noční sova", description: "Uč se po 23. hodině.", emoji: "🦉", check: (s) => s.hour >= 23 },
  { code: "early_bird", title: "Ranní ptáče", description: "Uč se před 7. hodinou ranní.", emoji: "🐦", check: (s) => s.hour >= 4 && s.hour < 7 },
];

export const achievementDef = (code: string) => ACHIEVEMENTS.find((a) => a.code === code);
