// Central access to environment variables. Server-only values throw lazily when missing,
// so the build itself never needs secrets.

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

type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const effort = (v: string | undefined, fallback: Effort): Effort =>
  (["low", "medium", "high", "xhigh", "max"] as const).includes(v as Effort) ? (v as Effort) : fallback;

/*
 * Cost/quality split (override any of these in Vercel env):
 *  - generator: strongest model (subtle Czech traps are the hard part), medium effort
 *  - validator: independent cheaper model – a second model also catches the generator's blind spots
 *  - explanations: strongest model, but cached per task (each task is explained once for everyone)
 *  - chat: cheaper model, low effort
 */
export const AI = {
  model: process.env.AI_MODEL || "claude-opus-5-5",
  generatorEffort: effort(process.env.AI_GENERATOR_EFFORT, "medium"),
  validatorModel: process.env.AI_VALIDATOR_MODEL || "claude-sonnet-5-5",
  validatorEffort: effort(process.env.AI_VALIDATOR_EFFORT, "medium"),
  explainModel: process.env.AI_EXPLAIN_MODEL || process.env.AI_MODEL || "claude-opus-5-5",
  chatModel: process.env.AI_CHAT_MODEL || "claude-sonnet-5-5",
  dailyChatLimit: Number(process.env.AI_DAILY_CHAT_LIMIT ?? 60),
  dailyExplainLimit: Number(process.env.AI_DAILY_EXPLAIN_LIMIT ?? 40),
  dailyGenerateLimit: Number(process.env.AI_DAILY_GENERATE_LIMIT ?? 40),
  enabled: Boolean(process.env.ANTHROPIC_API_KEY),
};
