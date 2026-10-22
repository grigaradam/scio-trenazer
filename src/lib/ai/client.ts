import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { AI } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

let client: Anthropic | null = null;
export function anthropic() {
  client ??= new Anthropic();
  return client;
}

export type AiKind = "chat" | "explain" | "generate";

/** Counts one AI call against the user's daily budget. Returns a 429 response when over. */
export async function spendBudget(userId: string, kind: AiKind) {
  if (!AI.enabled) {
    return NextResponse.json(
      { error: "AI není nastavená – doplň ANTHROPIC_API_KEY do proměnných prostředí." },
      { status: 503 },
    );
  }
  const limit = kind === "chat" ? AI.dailyChatLimit : kind === "explain" ? AI.dailyExplainLimit : AI.dailyGenerateLimit;
  const { data } = await createAdminClient().rpc("bump_ai_usage", { p_user: userId, p_kind: kind });
  if (typeof data === "number" && data > limit) {
    return NextResponse.json(
      { error: `Dnešní limit AI (${limit}×) je vyčerpaný. Zítra zase! Mezitím můžeš trénovat úlohy, které už jsou připravené.` },
      { status: 429 },
    );
  }
  return null;
}

/** Silent budget check for background work: true = allowed (and counted). */
export async function tryBudget(userId: string, kind: AiKind) {
  if (!AI.enabled) return false;
  const limit = kind === "chat" ? AI.dailyChatLimit : kind === "explain" ? AI.dailyExplainLimit : AI.dailyGenerateLimit;
  const { data } = await createAdminClient().rpc("bump_ai_usage", { p_user: userId, p_kind: kind });
  return typeof data !== "number" || data <= limit;
}

export function aiErrorResponse(err: unknown) {
  console.error("AI error", err);
  if (err instanceof Anthropic.RateLimitError)
    return NextResponse.json({ error: "AI je teď přetížená, zkus to za chvíli." }, { status: 429 });
  if (err instanceof Anthropic.AuthenticationError)
    return NextResponse.json({ error: "Neplatný ANTHROPIC_API_KEY." }, { status: 500 });
  if (err instanceof Anthropic.APIError)
    return NextResponse.json({ error: `Chyba AI (${err.status}).` }, { status: 502 });
  return NextResponse.json({ error: "Něco se pokazilo při volání AI." }, { status: 500 });
}
