import { after, NextResponse } from "next/server";
import { z } from "zod";
import { generateTasks } from "@/lib/ai/generate";
import { spendBudget } from "@/lib/ai/client";
import { taskTypeMeta } from "@/lib/content/exams";
import { genRef, stripGroup } from "@/lib/content/public";
import type { Group, TaskType } from "@/lib/content/types";
import { apiUser } from "@/lib/server/auth";
import { resolveTask } from "@/lib/server/tasks";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

const Body = z.object({
  type: z.string(),
  mode: z.enum(["mix", "mistakes", "new"]).default("mix"),
  exclude: z.array(z.string()).default([]),
});

export async function POST(req: Request) {
  const { user, error } = await apiUser();
  if (error) return error;
  const { type, mode, exclude } = Body.parse(await req.json());
  const meta = taskTypeMeta(type);
  if (!meta) return NextResponse.json({ error: "Neznámý typ úlohy" }, { status: 400 });
  const admin = createAdminClient();

  // 1) open mistakes first (spaced: least recently touched first)
  if (mode !== "new") {
    const { data: mistakes } = await admin
      .from("mistakes")
      .select("task_ref")
      .eq("user_id", user.id)
      .eq("task_type", type)
      .eq("status", "open")
      .order("updated_at", { ascending: true })
      .limit(50);
    const candidate = (mistakes ?? []).find((m) => !exclude.includes(m.task_ref));
    if (candidate) {
      const task = await resolveTask(candidate.task_ref);
      if (task) {
        return NextResponse.json({
          kind: "mistake",
          refs: [task.ref],
          group: stripGroup(task.group),
          origin: task.origin.kind === "test" ? `${task.origin.testTitle}, úloha ${task.origin.n}` : "Tvoje dřívější chyba",
        });
      }
    }
    if (mode === "mistakes") return NextResponse.json({ kind: "empty" });
  }

  // 2) a pooled AI task this user has never seen
  const pick = async () => {
    const { data } = await admin.rpc("pick_generated_tasks", { p_user: user.id, p_exam: meta.exam, p_type: type, p_limit: 3 });
    return (data ?? []) as { id: string; payload: Group; served_count: number }[];
  };
  let available = await pick();

  // 3) nothing left → generate fresh ones (counts against the daily AI budget)
  if (!available.length) {
    const over = await spendBudget(user.id, "generate");
    if (over) return over;
    const outcome = await generateTasks({ exam: meta.exam, type: type as TaskType, count: 2, userId: user.id });
    if (!outcome.accepted.length) {
      return NextResponse.json(
        { error: "AI tentokrát nevytvořila úlohu, která by prošla kontrolou kvality. Zkus to prosím znovu." },
        { status: 502 },
      );
    }
    available = await pick();
  }
  const task = available[0];
  if (!task) return NextResponse.json({ error: "Žádná úloha k dispozici" }, { status: 500 });

  await admin.from("task_seen").upsert({ user_id: user.id, task_ref: genRef(task.id) });
  await admin.from("generated_tasks").update({ served_count: task.served_count + 1 }).eq("id", task.id);

  // keep a small buffer ready for the next request
  if (available.length <= 1) {
    after(async () => {
      try {
        await generateTasks({ exam: meta.exam, type: type as TaskType, count: 2, userId: user.id });
      } catch (e) {
        console.error("background top-up", e);
      }
    });
  }

  const group = task.payload;
  return NextResponse.json({
    kind: "generated",
    refs: group.questions.map((_, i) => genRef(task.id, i)),
    group: stripGroup(group),
    origin: "Nová úloha (AI, ověřená)",
  });
}
