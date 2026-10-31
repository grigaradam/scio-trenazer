// Calendar days as Prague dates ("2026-10-31"). Stepping by 24 hours from a moment repeats or skips
// a day around the DST change, so the arithmetic runs on the date itself (as UTC midnight, which has no DST).

const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" });

/** Prague date of a moment. */
export const pragueDay = (at: Date = new Date()) => fmt.format(at);

/** The date n days later (negative = earlier). */
export const addDays = (day: string, n: number) => new Date(Date.parse(day) + n * 86400000).toISOString().slice(0, 10);

/** The last n days ending today, oldest first. */
export const lastDays = (n: number, today = pragueDay()) => Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));

/** Monday = 0 … Sunday = 6. */
export const weekday = (day: string) => (new Date(Date.parse(day)).getUTCDay() + 6) % 7;

/** Short Czech weekday name ("po", "út", …). */
export const weekdayShort = (day: string) =>
  new Intl.DateTimeFormat("cs-CZ", { weekday: "short", timeZone: "UTC" }).format(new Date(Date.parse(day)));
