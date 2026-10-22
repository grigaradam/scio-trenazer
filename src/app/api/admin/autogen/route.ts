import { NextResponse } from "next/server";
import { z } from "zod";
import { adminGuard } from "@/lib/server/admin-auth";
import { getAutogenState, updateAutogenState } from "@/lib/server/autogen";

// Switch endless generation on/off and set how many workers run in parallel.
export async function PATCH(req: Request) {
  const denied = await adminGuard();
  if (denied) return denied;
  const body = z.object({ enabled: z.boolean().optional(), workers: z.number().int().min(1).max(6).optional() }).parse(await req.json());
  const state = await getAutogenState();
  if (!state) return NextResponse.json({ error: "Spusť v Supabase migraci 0005_autogen.sql." }, { status: 409 });
  await updateAutogenState({
    ...(body.workers !== undefined ? { workers: body.workers } : {}),
    ...(body.enabled !== undefined
      ? { enabled: body.enabled, ...(body.enabled ? { credits_exhausted_at: null, last_error: null, started_at: new Date().toISOString() } : {}) }
      : {}),
  });
  return NextResponse.json({ ok: true });
}
