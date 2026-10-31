import "server-only";
import { randomInt } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// No 0/O/1/I/L – codes are typed by hand.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

export function randomCode() {
  const pick = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${pick()}-${pick()}`;
}

/** Reserves a one-time code. Returns true if it was valid and unused. */
export async function claimInvite(code: string) {
  const { data, error } = await createAdminClient().rpc("claim_invite", { p_code: normalizeCode(code) });
  if (error) console.error("claim_invite", error);
  return data === true;
}

export async function releaseInvite(code: string) {
  await createAdminClient().from("invite_codes").update({ used_at: null, used_by: null }).eq("code", normalizeCode(code));
}

/** Ties the code to the account and starts the plan it carries (its duration counts from now). */
export async function bindInvite(code: string, userId: string) {
  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("invite_codes")
    .update({ used_by: userId })
    .eq("code", normalizeCode(code))
    .select("*")
    .maybeSingle();
  const plan = (invite as { plan?: string; duration_days?: number | null } | null) ?? {};
  const update: Record<string, unknown> = { invite_code: normalizeCode(code), blocked: false };
  // without migration 0012 the code has no plan and the profile no plan columns
  if (plan.plan) {
    update.plan = plan.plan;
    // only Pro runs out (into Basic); Basic is forever
    update.plan_expires_at = plan.plan === "pro" && plan.duration_days ? new Date(Date.now() + plan.duration_days * 86400000).toISOString() : null;
  }
  await admin.from("profiles").update(update).eq("id", userId);
}
