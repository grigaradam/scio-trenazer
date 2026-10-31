import { NextResponse } from "next/server";
import { z } from "zod";
import { adminGuard } from "@/lib/server/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({
  userId: z.string().uuid(),
  /** Blocked users keep their data but must enter a new invite code. */
  blocked: z.boolean().optional(),
  plan: z.enum(["basic", "pro"]).optional(),
  /** ISO date Pro ends (then the account is Basic), null = forever */
  planExpiresAt: z.string().datetime().nullable().optional(),
});

// Block / unblock an account, or switch its plan and how long it lasts.
export async function PATCH(req: Request) {
  const denied = await adminGuard();
  if (denied) return denied;
  const { userId, blocked, plan, planExpiresAt } = Body.parse(await req.json());
  const update: Record<string, unknown> = {};
  if (blocked !== undefined) update.blocked = blocked;
  if (plan) update.plan = plan;
  if (planExpiresAt !== undefined) update.plan_expires_at = planExpiresAt;
  if (plan === "basic") update.plan_expires_at = null; // Basic has no end
  const { error } = await createAdminClient().from("profiles").update(update).eq("id", userId);
  if (error) {
    const missing = /plan/.test(error.message);
    return NextResponse.json({ error: missing ? "Spusť v Supabase migraci 0012_plans.sql." : error.message }, { status: missing ? 409 : 500 });
  }
  return NextResponse.json({ ok: true });
}
