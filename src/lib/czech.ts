// Czech grammar helpers that need no AI: plural forms follow fixed rules.

/** Picks the right form for a count: 1 → one, 2–4 → few, 0 and 5+ → many ("1 chyba, 3 chyby, 5 chyb"). */
export function plural(n: number, one: string, few: string, many: string) {
  const abs = Math.abs(n);
  return abs === 1 ? one : abs >= 2 && abs <= 4 ? few : many;
}

/** Count followed by the matching noun form: `count(3, "chyba", "chyby", "chyb")` → "3 chyby". */
export function count(n: number, one: string, few: string, many: string) {
  return `${n} ${plural(n, one, few, many)}`;
}
