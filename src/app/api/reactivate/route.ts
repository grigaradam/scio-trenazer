import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/server/auth";
import { bindInvite, claimInvite } from "@/lib/server/invites";

// A blocked account unlocks itself with a fresh one-time code.
export async function POST(req: Request) {
  const { user, error } = await apiUser({ allowBlocked: true });
  if (error) return error;
  const { code } = z.object({ code: z.string().trim().min(1).max(40) }).parse(await req.json());
  if (!(await claimInvite(code))) {
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "Neplatný nebo už použitý přístupový kód." }, { status: 403 });
  }
  await bindInvite(code, user.id);
  return NextResponse.json({ ok: true });
}
