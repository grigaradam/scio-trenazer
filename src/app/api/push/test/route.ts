import { NextResponse } from "next/server";
import { apiUser } from "@/lib/server/auth";
import { sendToUser } from "@/lib/server/push";

// Sends a test notification to all of the user's devices.
export async function POST() {
  const { user, error } = await apiUser();
  if (error) return error;
  const sent = await sendToUser(user.id, {
    title: "Oznámení fungují 🎉",
    body: "Takhle ti připomenu, když se ten den ještě nedostaneš k tréninku.",
    url: "/app",
    tag: "test",
  });
  if (!sent) return NextResponse.json({ error: "Oznámení se nepodařilo doručit." }, { status: 502 });
  return NextResponse.json({ ok: true, sent });
}
