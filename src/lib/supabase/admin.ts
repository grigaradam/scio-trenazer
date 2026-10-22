import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, serverEnv } from "@/lib/env";

// Untyped on purpose: row shapes are declared in lib/server/types.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = SupabaseClient<any, "public", "public", any, any>;

let admin: AdminClient | null = null;

/** Service-role client. Bypasses RLS – only use after the user has been verified. */
export function createAdminClient(): AdminClient {
  if (!admin) {
    admin = createClient(SUPABASE_URL, serverEnv().secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    }) as AdminClient;
  }
  return admin;
}
