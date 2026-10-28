import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { isAdmin } from "@/lib/server/admin-auth";
import { CREDIT_RETRY_MS, LEASE_SECONDS, getAutogenState, runAutogen, updateAutogenState } from "@/lib/server/autogen";
import { sendDailyReminders } from "@/lib/server/push";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

function bearerOk(req: Request) {
  const secret = process.env.AUTOGEN_SECRET;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Called every minute by pg_cron (Bearer AUTOGEN_SECRET) or by the admin dashboard.
// Responds immediately; the generation itself runs after the response (up to the 300 s limit).
// The same cron also drives the daily push reminders, whether or not autogen is enabled.
export async function POST(req: Request) {
  const fromCron = bearerOk(req);
  if (!fromCron && !(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const state = await getAutogenState();
  if (!state) return NextResponse.json({ status: "migration-missing" });
  // last_tick_at tracks the scheduler only – a manual kick from the dashboard must not look like a working cron
  if (fromCron) {
    await updateAutogenState({ last_tick_at: new Date().toISOString() });
    after(() => sendDailyReminders().catch((e) => console.error("push reminders", e)));
  }
  if (!state.enabled) return NextResponse.json({ status: "disabled" });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ status: "no-api-key" });
  if (state.credits_exhausted_at && Date.now() - new Date(state.credits_exhausted_at).getTime() < CREDIT_RETRY_MS) {
    return NextResponse.json({ status: "waiting-for-credits" });
  }

  const { data, error } = await createAdminClient().rpc("autogen_claim", { p_workers: state.workers, p_seconds: LEASE_SECONDS });
  if (error) return NextResponse.json({ status: "error", error: error.message }, { status: 500 });
  const slots = ((data ?? []) as (number | { autogen_claim: number })[]).map((s) => (typeof s === "number" ? s : s.autogen_claim));
  if (!slots.length) return NextResponse.json({ status: "all-workers-busy" });

  after(() => runAutogen(slots));
  return NextResponse.json({ status: "started", slots });
}
