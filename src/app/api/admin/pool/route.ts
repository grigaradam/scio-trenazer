import { NextResponse } from "next/server";
import { z } from "zod";
import { generateTasks } from "@/lib/ai/generate";
import { taskTypeMeta } from "@/lib/content/exams";
import { adminGuard } from "@/lib/server/admin-auth";
import { poolStock } from "@/lib/server/pool";

export const maxDuration = 300;

/** Fill the shared pool so every task type has at least `target` ready tasks for new users. */
export async function POST(req: Request) {
  const denied = await adminGuard();
  if (denied) return denied;
  const { type, target, force } = z
    .object({ type: z.string(), target: z.number().int().min(1).max(10).default(2), force: z.boolean().default(false) })
    .parse(await req.json());
  const meta = taskTypeMeta(type);
  if (!meta) return NextResponse.json({ error: "Neznámý typ" }, { status: 400 });

  // one candidate per request (generate → validate → optional revision) keeps well under the 300 s limit;
  // the dashboard calls this repeatedly until the type is stocked
  let stock = await poolStock(meta.exam, meta.id);
  let rejected = 0;
  let accepted = 0;
  let reason: string | null = null;
  if (force || stock < target) {
    const out = await generateTasks({ exam: meta.exam, type: meta.id, count: 1, deadline: Date.now() + 270_000 });
    rejected = out.rejected.length;
    accepted = out.accepted.length;
    reason = out.rejected[0]?.reason ?? null;
    stock = await poolStock(meta.exam, meta.id);
  }
  return NextResponse.json({ type, stock, rejected, accepted, reason });
}
