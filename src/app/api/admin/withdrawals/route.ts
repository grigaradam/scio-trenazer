import { NextResponse } from "next/server";
import { z } from "zod";
import { adminGuard } from "@/lib/server/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Marks an online withdrawal as handled (confirmation e-mail sent, refund arranged) – or back to open.
export async function POST(req: Request) {
  const denied = await adminGuard();
  if (denied) return denied;
  const body = z.object({ id: z.string().uuid(), handled: z.boolean() }).safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "Neplatný vstup" }, { status: 400 });
  const { error } = await createAdminClient()
    .from("withdrawals")
    .update({ handled_at: body.data.handled ? new Date().toISOString() : null })
    .eq("id", body.data.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
