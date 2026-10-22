import { NextResponse } from "next/server";
import { z } from "zod";
import { adminGuard } from "@/lib/server/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Block / unblock an account. Blocked users keep their data but must enter a new invite code.
export async function PATCH(req: Request) {
  const denied = await adminGuard();
  if (denied) return denied;
  const { userId, blocked } = z.object({ userId: z.string().uuid(), blocked: z.boolean() }).parse(await req.json());
  const { error } = await createAdminClient().from("profiles").update({ blocked }).eq("id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
