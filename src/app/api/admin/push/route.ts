import { NextResponse } from "next/server";
import { z } from "zod";
import { adminGuard } from "@/lib/server/admin-auth";
import { sendToAll, sendToUser } from "@/lib/server/push";

const Body = z.object({
  title: z.string().trim().min(1, "Chybí nadpis").max(80),
  body: z.string().trim().max(240).default(""),
  url: z.string().trim().regex(/^\/\S*$/, "Odkaz musí začínat lomítkem, např. /app/practice").default("/app"),
  /** One user's id, or omitted for everyone with notifications on. */
  userId: z.uuid().optional(),
});

// Manual notification from the admin dashboard – to one user or to everyone.
export async function POST(req: Request) {
  const denied = await adminGuard();
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Neplatný vstup" }, { status: 400 });
  const { userId, ...message } = parsed.data;
  const sent = userId ? await sendToUser(userId, message) : await sendToAll(message);
  return NextResponse.json({ sent });
}
