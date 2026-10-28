import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/server/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const Subscription = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

// Saves this device's push subscription (the browser hands it over after the user allows notifications).
export async function POST(req: Request) {
  const { user, error } = await apiUser();
  if (error) return error;
  const sub = Subscription.safeParse(await req.json());
  if (!sub.success) return NextResponse.json({ error: "Neplatný odběr" }, { status: 400 });
  const { error: dbError } = await createAdminClient()
    .from("push_subscriptions")
    .upsert({
      endpoint: sub.data.endpoint,
      user_id: user.id,
      p256dh: sub.data.keys.p256dh,
      auth: sub.data.keys.auth,
      user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    });
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { user, error } = await apiUser({ allowBlocked: true });
  if (error) return error;
  const body = z.object({ endpoint: z.string().max(1000) }).safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Chybí endpoint" }, { status: 400 });
  await createAdminClient().from("push_subscriptions").delete().eq("endpoint", body.data.endpoint).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
