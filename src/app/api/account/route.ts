import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/server/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/supabase/demo";

// Self-service account deletion (GDPR art. 17, terms art. 11). Deleting the auth user cascades to the
// profile and all learning data; AI cost rows keep only an anonymous record (user_id → null).
export async function DELETE(req: Request) {
  const { user, error } = await apiUser({ allowBlocked: true });
  if (error) return error;
  const body = z.object({ confirm: z.literal("SMAZAT") }).safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "Pro potvrzení napiš SMAZAT." }, { status: 400 });

  const admin = createAdminClient();
  // profile pictures live in Storage, outside the cascade
  const { data: files } = await admin.storage.from("avatars").list(user.id);
  const paths = (files ?? []).map((f) => `${user.id}/${f.name}`);
  if (paths.length) await admin.storage.from("avatars").remove(paths);

  const { error: delError } = await admin.auth.admin.deleteUser(user.id);
  if (delError) {
    console.error("deleteUser", delError.message);
    return NextResponse.json({ error: "Účet se nepodařilo smazat. Napiš nám prosím na grigar.adam@gmail.com." }, { status: 500 });
  }
  if (!isDemo()) await (await createClient()).auth.signOut({ scope: "local" }).catch(() => {});
  return NextResponse.json({ ok: true });
}
