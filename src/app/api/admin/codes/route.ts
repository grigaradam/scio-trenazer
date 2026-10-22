import { NextResponse } from "next/server";
import { z } from "zod";
import { adminGuard } from "@/lib/server/admin-auth";
import { normalizeCode, randomCode } from "@/lib/server/invites";
import { createAdminClient } from "@/lib/supabase/admin";

const Create = z.object({
  count: z.number().int().min(1).max(50).optional(),
  code: z.string().trim().min(4).max(40).regex(/^[A-Za-z0-9-]+$/, "Jen písmena, čísla a pomlčky").optional(),
  note: z.string().trim().max(80).optional(),
});

// Create one-time invite codes: random (count) or a custom one (code).
export async function POST(req: Request) {
  const denied = await adminGuard();
  if (denied) return denied;
  const parsed = Create.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Neplatný vstup" }, { status: 400 });
  const { count, code, note } = parsed.data;
  const codes = code ? [normalizeCode(code)] : Array.from({ length: count ?? 1 }, randomCode);
  const { error } = await createAdminClient()
    .from("invite_codes")
    .insert(codes.map((c) => ({ code: c, note: note || null })));
  if (error) {
    const dup = /duplicate|unique/i.test(error.message);
    return NextResponse.json({ error: dup ? "Tento kód už existuje." : error.message }, { status: dup ? 409 : 500 });
  }
  return NextResponse.json({ codes });
}

// Revoke an unused code.
export async function PATCH(req: Request) {
  const denied = await adminGuard();
  if (denied) return denied;
  const { code } = z.object({ code: z.string() }).parse(await req.json());
  await createAdminClient().from("invite_codes").update({ revoked: true }).eq("code", normalizeCode(code));
  return NextResponse.json({ ok: true });
}
