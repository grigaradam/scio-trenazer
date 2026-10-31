// Basic / Pro without payments – the admin switches plans in /dashboard. Shared by server and client.

export type Plan = "basic" | "pro";

export const BASIC = {
  /** Basic can do one full test (the first one it starts) – retakes of it included. */
  tests: 1,
  /** Practice tasks per day, only in the all-types mix. */
  dailyTasks: 10,
};

interface PlanFields {
  plan?: string | null;
  plan_expires_at?: string | null;
}

const expired = (p: PlanFields) => Boolean(p.plan_expires_at && new Date(p.plan_expires_at).getTime() <= Date.now());

/**
 * The plan in force right now. An expired Pro drops to Basic. Without migration 0012 there is
 * no plan column and everybody keeps the full app.
 */
export function effectivePlan(p: PlanFields): Plan {
  if (p.plan !== "basic" && p.plan !== "pro") return "pro";
  return p.plan === "pro" && !expired(p) ? "pro" : "basic";
}

/** End of a plan that is still running, null = forever (or already over). */
export const activeUntil = (p: PlanFields) => (p.plan_expires_at && !expired(p) ? p.plan_expires_at : null);

/** The plan has an end date that has passed. */
export const planExpired = expired;

/** A time-limited Basic ends the access itself (same as a blocked account: a new code unlocks it). */
export const basicExpired = (p: PlanFields) => p.plan === "basic" && expired(p);

/** What Basic misses – shown next to locks, never as a popup. */
export const PRO_PERKS = [
  "Všechny ostré testy z minulých let",
  "Trénink jednotlivých typů úloh a oddílů zvlášť",
  "Neomezeně úloh denně a nové úlohy od AI na míru",
  "Oprava chyb ve Slabinách a režimy „Moje chyby“ / „Jen nové“",
];
