// Central access to environment variables. Server-only values throw lazily when missing,
// so the build itself never needs secrets.

// Public address of the app – invite links, link previews and the cron job point here.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://nanecisto.fun").replace(/\/$/, "");

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function serverEnv() {
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !secret) {
    throw new Error(
      "Chybí Supabase proměnné prostředí (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY).",
    );
  }
  return { secret };
}

// Web Push (VAPID). Generate once with `npx web-push generate-vapid-keys`.
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function vapidEnv() {
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!VAPID_PUBLIC_KEY || !privateKey) return null;
  return { publicKey: VAPID_PUBLIC_KEY, privateKey, subject: process.env.VAPID_SUBJECT || SITE_URL };
}

type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const effort = (v: string | undefined, fallback: Effort): Effort =>
  (["low", "medium", "high", "xhigh", "max"] as const).includes(v as Effort) ? (v as Effort) : fallback;

/** "slovni=claude-sonnet-5-5, porovnani=claude-haiku-5-5" → { slovni: "claude-sonnet-5-5", … } */
const modelMap = (v: string | undefined): Record<string, string> =>
  Object.fromEntries(
    (v ?? "")
      .split(",")
      .map((pair) => pair.split("=").map((s) => s.trim()))
      .filter((p): p is [string, string] => p.length === 2 && Boolean(p[0]) && Boolean(p[1])),
  );

const generatorEffort = effort(process.env.AI_GENERATOR_EFFORT, "medium");

/*
 * Cost/quality split (override any of these in Vercel env):
 *  - generator: strongest model (subtle Czech traps are the hard part), medium effort;
 *    per task type it can be switched to a cheaper model once an A/B test (npm run ab) shows the quality holds
 *  - variants of maths/logic tasks: cheap model – the trap design comes from a validated parent task
 *  - validator: independent cheaper model – a second model also catches the generator's blind spots
 *  - explanations: strongest model for real Scio tasks; AI tasks bring their author's trap analysis, so a cheaper
 *    model only has to explain it (cached per task – each task is explained once for everyone)
 *  - chat: cheaper model, low effort
 */
export const AI = {
  model: process.env.AI_MODEL || "claude-opus-5-5",
  /** Generator model per task type, e.g. AI_MODEL_BY_TYPE="slovni=claude-sonnet-5-5". Unlisted types use AI_MODEL. */
  modelByType: modelMap(process.env.AI_MODEL_BY_TYPE),
  generatorEffort,
  /** Effort of the first draft and of the revision after a rejection (both default to AI_GENERATOR_EFFORT). */
  firstEffort: effort(process.env.AI_FIRST_EFFORT, generatorEffort),
  revisionEffort: effort(process.env.AI_REVISION_EFFORT, generatorEffort),
  variantModel: process.env.AI_VARIANT_MODEL || "claude-haiku-5-5",
  variantEffort: effort(process.env.AI_VARIANT_EFFORT, "medium"),
  /** Proposes unused words for synonym / word-formation tasks (one tiny call per batch). */
  wordsModel: process.env.AI_WORDS_MODEL || "claude-haiku-5-5",
  validatorModel: process.env.AI_VALIDATOR_MODEL || "claude-sonnet-5-5",
  validatorEffort: effort(process.env.AI_VALIDATOR_EFFORT, "medium"),
  explainModel: process.env.AI_EXPLAIN_MODEL || process.env.AI_MODEL || "claude-opus-5-5",
  explainGeneratedModel: process.env.AI_EXPLAIN_GEN_MODEL || "claude-sonnet-5-5",
  chatModel: process.env.AI_CHAT_MODEL || "claude-sonnet-5-5",
  dailyChatLimit: Number(process.env.AI_DAILY_CHAT_LIMIT ?? 60),
  dailyExplainLimit: Number(process.env.AI_DAILY_EXPLAIN_LIMIT ?? 40),
  dailyGenerateLimit: Number(process.env.AI_DAILY_GENERATE_LIMIT ?? 40),
  enabled: Boolean(process.env.ANTHROPIC_API_KEY),
};
