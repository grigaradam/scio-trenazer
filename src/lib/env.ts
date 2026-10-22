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

export const AI = {
  model: process.env.AI_MODEL || "claude-opus-5-5",
  validatorModel: process.env.AI_VALIDATOR_MODEL || process.env.AI_MODEL || "claude-opus-5-5",
  dailyChatLimit: Number(process.env.AI_DAILY_CHAT_LIMIT ?? 60),
  dailyExplainLimit: Number(process.env.AI_DAILY_EXPLAIN_LIMIT ?? 40),
  dailyGenerateLimit: Number(process.env.AI_DAILY_GENERATE_LIMIT ?? 15),
  enabled: Boolean(process.env.ANTHROPIC_API_KEY),
};
