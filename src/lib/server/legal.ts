import "server-only";
import { TERMS_VERSION } from "@/lib/legal";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Records that the user accepted the terms and asked for access to start right away (code activation).
 * Without migration 0018 the columns are missing – the error is logged, sign-up still succeeds.
 */
export async function recordAcceptance(userId: string) {
  const now = new Date().toISOString();
  const { error } = await createAdminClient()
    .from("profiles")
    .update({ terms_version: TERMS_VERSION, terms_accepted_at: now, start_requested_at: now })
    .eq("id", userId);
  if (error) console.error("recordAcceptance", error.message);
}
