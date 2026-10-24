import { NextResponse } from "next/server";
import { z } from "zod";
import { generateTasks } from "@/lib/ai/generate";
import { spendBudget } from "@/lib/ai/client";
import { type TaskTypeMeta, taskTypeMeta } from "@/lib/content/exams";
import { genRef, stripGroup } from "@/lib/content/public";
import type { Group, TaskType } from "@/lib/content/types";
import { apiUser } from "@/lib/server/auth";
import { ensureTaskBuffer, pickUnseen } from "@/lib/server/pool";
import { resolveTask } from "@/lib/server/tasks";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

const Body = z.object({
  /** one type, or several for a mixed session (each task comes from one of them) */
  type: z.string().optional(),
  types: z.array(z.string()).max(50).optional(),
  mode: z.enum(["mix", "mistakes", "new"]).default("mix"),
  exclude: z.array(z.string()).default([]),
});

export async function POST(req: Request) {
  const { user, error } = await apiUser();
  if (error) return error;
  const { type, types, mode, exclude } = Body.parse(await req.json());
  const metas = [...new Set(types ?? (type ? [type] : []))].map(taskTypeMeta);
  if (!metas.length || metas.some((m) => !m)) return NextResponse.json({ error: "Neznámý typ úlohy" }, { status: 400 });
  const pool = metas as TaskTypeMeta[];
  const admin = createAdminClient();

  // 1) open mistakes first (spaced: least recently touched first)
  if (mode !== "new") {
    const { data: mistakes } = await admin
      .from("mistakes")
      .select("task_ref,task_type")
      .eq("user_id", user.id)
      .in(
        "task_type",
        pool.map((m) => m.id),
      )
      .eq("status", "open")
      .order("updated_at", { ascending: true })
      .limit(50);
    const candidate = (mistakes ?? []).find((m) => !exclude.includes(m.task_ref));
    if (candidate) {
      const task = await resolveTask(candidate.task_ref);
      if (task) {
        // prepare a fresh task in the background, so it's ready when the mistakes run out
        const meta = taskTypeMeta(task.taskType);
        if (mode === "mix" && meta) ensureTaskBuffer(user.id, meta.exam, meta.id);
        return NextResponse.json({
          kind: "mistake",
          type: task.taskType,
          refs: [task.ref],
          group: stripGroup(task.group),
          origin: task.origin.kind === "test" ? `${task.origin.testTitle}, úloha ${task.origin.n}` : "Tvoje dřívější chyba",
        });
      }
    }
    if (mode === "mistakes") return NextResponse.json({ kind: "empty" });
  }

  // 2) a pooled AI task this user has never seen – in a mix, from a random type that has one ready
  const pick = async (meta: TaskTypeMeta) =>
    (await pickUnseen(user.id, meta.exam, meta.id, 3)) as unknown as { id: string; payload: Group; served_count: number }[];
  const order = [...pool].sort(() => Math.random() - 0.5);
  let meta = order[0];
  let available: Awaited<ReturnType<typeof pick>> = [];
  for (const m of order) {
    available = await pick(m);
    if (available.length) {
      meta = m;
      break;
    }
  }

  // 3) nothing left → generate fresh ones (counts against the daily AI budget)
  if (!available.length) {
    const over = await spendBudget(user.id, "generate");
    if (over) return over;
    const started = Date.now();
    const deadline = started + 270_000; // stay under the 300 s function limit
    let outcome = await generateTasks({ exam: meta.exam, type: meta.id as TaskType, count: 2, userId: user.id, deadline });
    // both candidates rejected and there is still time left in this request → one more round
    if (!outcome.accepted.length && Date.now() + 150_000 < deadline) {
      outcome = await generateTasks({ exam: meta.exam, type: meta.id as TaskType, count: 2, userId: user.id, deadline });
    }
    if (!outcome.accepted.length) {
      return NextResponse.json(
        { error: "AI tentokrát nevytvořila úlohu, která by prošla kontrolou kvality. Zkus to prosím znovu." },
        { status: 502 },
      );
    }
    available = await pick(meta);
  }
  const task = available[0];
  if (!task) return NextResponse.json({ error: "Žádná úloha k dispozici" }, { status: 500 });

  await admin.from("task_seen").upsert({ user_id: user.id, task_ref: genRef(task.id) });
  await admin.from("generated_tasks").update({ served_count: task.served_count + 1 }).eq("id", task.id);

  // keep a few pre-generated tasks of this type waiting, so fast answers never hit a generation wait
  ensureTaskBuffer(user.id, meta.exam, meta.id);

  const group = task.payload;
  return NextResponse.json({
    kind: "generated",
    type: meta.id,
    refs: group.questions.map((_, i) => genRef(task.id, i)),
    group: stripGroup(group),
    origin: "Nová úloha (AI, ověřená)",
  });
}
