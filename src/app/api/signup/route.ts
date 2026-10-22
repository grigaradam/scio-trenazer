import { NextResponse } from "next/server";
import { z } from "zod";
import { bindInvite, claimInvite, releaseInvite } from "@/lib/server/invites";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(6).max(200),
  name: z.string().trim().max(40).optional(),
  code: z.string().trim().min(1).max(40),
});

// Invite-only registration with one-time codes generated in /dashboard.
// Users are created server-side, so public sign-ups stay disabled in Supabase.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Zkontroluj e-mail a heslo (min. 6 znaků)." }, { status: 400 });
  const { email, password, name, code } = parsed.data;

  if (!(await claimInvite(code))) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return NextResponse.json({ error: "Neplatný nebo už použitý přístupový kód." }, { status: 403 });
  }

  const { data, error } = await createAdminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name || email.split("@")[0] },
  });
  if (error || !data.user) {
    await releaseInvite(code); // the code stays usable
    const exists = /already|registered|exists/i.test(error?.message ?? "");
    return NextResponse.json(
      { error: exists ? "Tento e-mail už je zaregistrovaný. Přihlas se." : "Účet se nepodařilo vytvořit." },
      { status: exists ? 409 : 500 },
    );
  }
  await bindInvite(code, data.user.id);
  return NextResponse.json({ ok: true });
}
