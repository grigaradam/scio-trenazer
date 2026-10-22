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

export async function bindInvite(code: string, userId: string) {
  const admin = createAdminClient();
  await admin.from("invite_codes").update({ used_by: userId }).eq("code", normalizeCode(code));
  await admin.from("profiles").update({ invite_code: normalizeCode(code), blocked: false }).eq("id", userId);
}
