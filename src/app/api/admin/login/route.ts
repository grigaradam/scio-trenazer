import { NextResponse } from "next/server";
import { z } from "zod";
import { adminConfigured, checkCredentials, setAdminSession } from "@/lib/server/admin-auth";

export async function POST(req: Request) {
  if (!adminConfigured())
    return NextResponse.json({ error: "Admin není nastavený – doplň ADMIN_USERNAME a ADMIN_PASSWORD ve Vercelu." }, { status: 503 });
  const body = z.object({ username: z.string(), password: z.string() }).safeParse(await req.json().catch(() => ({})));
  if (!body.success || !checkCredentials(body.data.username, body.data.password)) {
    await new Promise((r) => setTimeout(r, 1000));
    return NextResponse.json({ error: "Špatné jméno nebo heslo." }, { status: 401 });
  }
  await setAdminSession();
  return NextResponse.json({ ok: true });
}
