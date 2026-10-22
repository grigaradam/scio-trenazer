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
  const { type, target } = z.object({ type: z.string(), target: z.number().int().min(1).max(10).default(2) }).parse(await req.json());
  const meta = taskTypeMeta(type);
  if (!meta) return NextResponse.json({ error: "Neznámý typ" }, { status: 400 });

  const started = Date.now();
  let stock = await poolStock(meta.exam, meta.id);
  let rejected = 0;
  // up to 2 rounds, as long as there is time left in this request
  for (let round = 0; round < 2 && stock < target && Date.now() - started < 150_000; round++) {
    const out = await generateTasks({ exam: meta.exam, type: meta.id, count: target - stock });
    rejected += out.rejected.length;
    stock = await poolStock(meta.exam, meta.id);
  }
  return NextResponse.json({ type, stock, rejected });
}
