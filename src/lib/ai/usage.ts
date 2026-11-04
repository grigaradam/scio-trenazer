import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";

// USD per 1M tokens (Anthropic list prices, checked 2026-11-04). Thinking tokens are billed as output.
// Cache writes cost 1.25× input (5-minute cache) or 2× input (1-hour cache); the Batch API halves everything.
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
};

type UsageLike = Pick<Anthropic.Usage, "input_tokens" | "output_tokens"> & Partial<Anthropic.Usage>;

/** Did this call run in a message batch (half price)? */
export const isBatchUsage = (u: UsageLike | null | undefined) => u?.service_tier === "batch";

export function costUsd(model: string, u: UsageLike, batch = isBatchUsage(u)) {
  const p = PRICES[model] ?? PRICES["claude-opus-5-5"];
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  // the TTL breakdown is missing on old responses – then every write counts as a 5-minute one
  const write1h = Math.min(cacheWrite, u.cache_creation?.ephemeral_1h_input_tokens ?? 0);
  const write5m = cacheWrite - write1h;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const full =
    u.input_tokens * p.input + write5m * p.input * 1.25 + write1h * p.input * 2 + cacheRead * p.cacheRead + u.output_tokens * p.output;
  return (full * (batch ? 0.5 : 1)) / 1e6;
}

export type AiCallKind = "explain" | "chat" | "generate" | "validate" | "reject" | "accept" | "learn" | "name" | "words";

/** Which step of task generation a call belongs to. */
export type AiStage = "fresh" | "revise" | "variant" | "variant-revise" | "validate" | "words";

/** Logs one Claude API call with its token usage and cost (never throws). */
export async function logAiCall(opts: {
  userId?: string | null;
  kind: AiCallKind;
  model: string;
  usage?: UsageLike | null;
  ok?: boolean;
  /** Free-text note (rejection reason). Needs migration 0003. */
  note?: string;
  /** Task type and generation step – cost per task type on the dashboard. Needs migration 0015. */
  type?: string;
  stage?: AiStage;
  /** Ran through the Batch API (also detected from usage.service_tier). */
  batch?: boolean;
}) {
  try {
    const u = opts.usage;
    const batch = opts.batch ?? isBatchUsage(u);
    const row: Record<string, unknown> = {
      user_id: opts.userId ?? null,
      kind: opts.kind,
      model: opts.model,
      input_tokens: u?.input_tokens ?? 0,
      output_tokens: u?.output_tokens ?? 0,
      cache_read_tokens: u?.cache_read_input_tokens ?? 0,
      cache_write_tokens: u?.cache_creation_input_tokens ?? 0,
      cost_usd: u ? costUsd(opts.model, u, batch) : 0,
      ok: opts.ok ?? (opts.kind === "reject" ? false : true),
    };
    const extra: Record<string, unknown> = {
      ...(opts.type ? { task_type: opts.type } : {}),
      ...(opts.stage ? { stage: opts.stage } : {}),
      ...(batch ? { batch: true } : {}),
      ...(u?.output_tokens_details?.thinking_tokens ? { thinking_tokens: u.output_tokens_details.thinking_tokens } : {}),
      ...(u?.cache_creation?.ephemeral_1h_input_tokens ? { cache_write_1h_tokens: u.cache_creation.ephemeral_1h_input_tokens } : {}),
    };
    const admin = createAdminClient();
    const note = opts.note ? { note: opts.note } : {};
    // older databases miss the newer columns (0015: type/stage/…, 0003: note) – keep the row anyway
    const shapes = [{ ...row, ...extra, ...note }, { ...row, ...note }, row];
    const unique = shapes.filter((s, i) => shapes.findIndex((o) => Object.keys(o).length === Object.keys(s).length) === i);
    for (const shape of unique) {
      const { error } = await admin.from("ai_calls").insert(shape);
      if (!error) return;
    }
  } catch (e) {
    console.error("logAiCall", e);
  }
}
