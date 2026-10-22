import { NextResponse } from "next/server";
import { z } from "zod";
import { aiErrorResponse, spendBudget } from "@/lib/ai/client";
import { generateExplanation } from "@/lib/ai/explain";
import { AI } from "@/lib/env";
import { apiUser } from "@/lib/server/auth";
import { resolveTask } from "@/lib/server/tasks";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 120;

// AI explanation of a task. Cached per task for everyone (saves tokens).
export async function POST(req: Request) {
  const { user, error } = await apiUser();
  if (error) return error;
  const { ref } = z.object({ ref: z.string() }).parse(await req.json());
  const task = await resolveTask(ref);
  if (!task) return NextResponse.json({ error: "Úloha nenalezena" }, { status: 404 });

  const admin = createAdminClient();
  const { data: cached } = await admin.from("explanations").select("content").eq("task_ref", task.ref).maybeSingle();
  if (cached) return NextResponse.json({ explanation: cached.content, answer: task.question.parts.map((p) => p.answer) });

  const over = await spendBudget(user.id, "explain");
  if (over) return over;
  try {
    const explanation = await generateExplanation(task, user.id);
    await admin.from("explanations").upsert({ task_ref: task.ref, content: explanation, model: AI.explainModel });
    return NextResponse.json({ explanation, answer: task.question.parts.map((p) => p.answer) });
  } catch (err) {
    return aiErrorResponse(err);
  }
}
