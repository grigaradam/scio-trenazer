import { NextResponse } from "next/server";
import { apiUser } from "@/lib/server/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Page view counter for the admin dashboard (traffic + "online now").
export async function POST() {
  const { user, error } = await apiUser({ allowBlocked: true });
  if (error) return error;
  const { error: dbError } = await createAdminClient().rpc("track_view", { p_user: user.id });
  if (dbError) console.error("track_view", dbError.message);
  return NextResponse.json({ ok: true });
}
