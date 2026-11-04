import { NextResponse } from "next/server";
import { z } from "zod";
import { adminGuard } from "@/lib/server/admin-auth";
import { getAutogenState, updateAutogenState } from "@/lib/server/autogen";
import { batchReady } from "@/lib/server/batch-gen";

// Switch endless generation on/off, set how many workers run in parallel and whether it goes through the Batch API.
export async function PATCH(req: Request) {
  const denied = await adminGuard();
  if (denied) return denied;
  const body = z
    .object({ enabled: z.boolean().optional(), workers: z.number().int().min(1).max(6).optional(), mode: z.enum(["sync", "batch"]).optional() })
    .parse(await req.json());
  const state = await getAutogenState();
  if (!state) return NextResponse.json({ error: "Spusť v Supabase migraci 0005_autogen.sql." }, { status: 409 });
  if (body.mode && (state.mode === undefined || (body.mode === "batch" && !(await batchReady()))))
    return NextResponse.json({ error: "Pro Batch API spusť v Supabase migraci 0015_cheaper_tasks.sql." }, { status: 409 });
  await updateAutogenState({
    ...(body.workers !== undefined ? { workers: body.workers } : {}),
    ...(body.mode ? { mode: body.mode } : {}),
    ...(body.enabled !== undefined
      ? { enabled: body.enabled, ...(body.enabled ? { credits_exhausted_at: null, last_error: null, started_at: new Date().toISOString() } : {}) }
      : {}),
  });
  return NextResponse.json({ ok: true });
}
