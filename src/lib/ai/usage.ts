import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";

// USD per 1M tokens (Anthropic list prices). Thinking tokens are billed as output.
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
};

export function costUsd(model: string, u: Pick<Anthropic.Usage, "input_tokens" | "output_tokens"> & Partial<Anthropic.Usage>) {
  const p = PRICES[model] ?? PRICES["claude-opus-5-5"];
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  return (u.input_tokens * p.input + cacheWrite * p.input * 1.25 + cacheRead * p.cacheRead + u.output_tokens * p.output) / 1e6;
}

export type AiCallKind = "explain" | "chat" | "generate" | "validate" | "reject" | "accept" | "learn" | "name";

/** Logs one Claude API call with its token usage and cost (never throws). */
export async function logAiCall(opts: {
  userId?: string | null;
  kind: AiCallKind;
  model: string;
  usage?: Anthropic.Usage | null;
  ok?: boolean;
  /** Free-text note (rejection reason). Needs migration 0003. */
  note?: string;
}) {
  try {
    const u = opts.usage;
    const row: Record<string, unknown> = {
      user_id: opts.userId ?? null,
      kind: opts.kind,
      model: opts.model,
      input_tokens: u?.input_tokens ?? 0,
      output_tokens: u?.output_tokens ?? 0,
      cache_read_tokens: u?.cache_read_input_tokens ?? 0,
      cache_write_tokens: u?.cache_creation_input_tokens ?? 0,
      cost_usd: u ? costUsd(opts.model, u) : 0,
      ok: opts.ok ?? (opts.kind === "reject" ? false : true),
    };
    const admin = createAdminClient();
    const { error } = await admin.from("ai_calls").insert(opts.note ? { ...row, note: opts.note } : row);
    // without migration 0003 the note column is missing – keep the row anyway
    if (error && opts.note) await admin.from("ai_calls").insert(row);
  } catch (e) {
    console.error("logAiCall", e);
  }
}
