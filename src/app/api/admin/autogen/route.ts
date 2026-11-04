import { NextResponse } from "next/server";
import { z } from "zod";
import { adminGuard } from "@/lib/server/admin-auth";
import { EXAMS } from "@/lib/content/exams";
import { getAutogenState, updateAutogenState } from "@/lib/server/autogen";
import { batchReady } from "@/lib/server/batch-gen";

// Switch endless generation on/off, set how many workers run in parallel and whether it goes through the Batch API.
export async function PATCH(req: Request) {
  const denied = await adminGuard();
  if (denied) return denied;
  const enabledExams = EXAMS.filter((e) => e.enabled).map((e) => e.id as string);
  const body = z
    .object({
      enabled: z.boolean().optional(),
      workers: z.number().int().min(1).max(6).optional(),
      mode: z.enum(["sync", "batch"]).optional(),
      /** exams endless generation fills; null or every enabled exam = all */
      exams: z.array(z.string()).nullable().optional(),
      /** unseen tasks per type to keep for the most active user; 0 = no limit */
      stockTarget: z.number().int().min(0).max(5000).optional(),
    })
    .parse(await req.json());
  const state = await getAutogenState();
  if (!state) return NextResponse.json({ error: "Spusť v Supabase migraci 0005_autogen.sql." }, { status: 409 });
  if (body.mode && (state.mode === undefined || (body.mode === "batch" && !(await batchReady()))))
    return NextResponse.json({ error: "Pro Batch API spusť v Supabase migraci 0015_cheaper_tasks.sql." }, { status: 409 });
  if ((body.exams !== undefined || body.stockTarget !== undefined) && state.stock_target === undefined)
    return NextResponse.json({ error: "Pro výběr zkoušek a cílovou zásobu spusť v Supabase migraci 0017_autogen_targets.sql." }, { status: 409 });
  const exams = body.exams?.filter((e) => enabledExams.includes(e));
  if (body.exams && !exams?.length) return NextResponse.json({ error: "Vyber aspoň jednu zkoušku." }, { status: 400 });
  await updateAutogenState({
    ...(body.workers !== undefined ? { workers: body.workers } : {}),
    ...(body.mode ? { mode: body.mode } : {}),
    // all enabled exams = no filter (a newly enabled exam is then filled too)
    ...(body.exams !== undefined ? { exams: !exams || exams.length === enabledExams.length ? null : exams } : {}),
    ...(body.stockTarget !== undefined ? { stock_target: body.stockTarget } : {}),
    ...(body.enabled !== undefined
      ? { enabled: body.enabled, ...(body.enabled ? { credits_exhausted_at: null, last_error: null, started_at: new Date().toISOString() } : {}) }
      : {}),
  });
  return NextResponse.json({ ok: true });
}
