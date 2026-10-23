import { NextResponse } from "next/server";
import { z } from "zod";
import { aiErrorResponse, spendBudget } from "@/lib/ai/client";
import { EXPLAIN_VERSION, QUOTE_TYPES, generateExplanation, type Explanation } from "@/lib/ai/explain";
import { AI } from "@/lib/env";
import { apiUser } from "@/lib/server/auth";
import { resolveTask, type ResolvedTask } from "@/lib/server/tasks";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 120;

// Generations in progress on this instance: concurrent requests for the same task share one AI call.
const inFlight = new Map<string, Promise<Explanation>>();

function generateOnce(task: ResolvedTask, userId: string) {
  let p = inFlight.get(task.ref);
  if (!p) {
    p = generateExplanation(task, userId)
      .then(async (explanation) => {
        await createAdminClient()
          .from("explanations")
          .upsert({ task_ref: task.ref, content: { ...explanation, v: EXPLAIN_VERSION }, model: AI.explainModel });
        return explanation;
      })
      .finally(() => inFlight.delete(task.ref));
    inFlight.set(task.ref, p);
  }
  return p;
}

// AI explanation of a task. Cached per task for everyone (saves tokens).
export async function POST(req: Request) {
  const { user, error } = await apiUser();
  if (error) return error;
  const { ref } = z.object({ ref: z.string() }).parse(await req.json());
  const task = await resolveTask(ref);
  if (!task) return NextResponse.json({ error: "Úloha nenalezena" }, { status: 404 });
  const answer = task.question.parts.map((p) => p.answer);

  const { data: cached } = await createAdminClient().from("explanations").select("content").eq("task_ref", task.ref).maybeSingle();
  // explanations cached before [[quotes]] existed are regenerated once for the task types that use them
  const stale = cached && QUOTE_TYPES.includes(task.taskType) && (cached.content as { v?: number }).v !== EXPLAIN_VERSION;
  if (cached && !stale) return NextResponse.json({ explanation: cached.content, answer });

  // someone else is already generating it → wait for that instead of paying (and counting the budget) twice
  const pending = inFlight.get(task.ref);
  if (!pending) {
    const over = await spendBudget(user.id, "explain");
    if (over) return over;
  }
  try {
    const explanation = await (pending ?? generateOnce(task, user.id));
    return NextResponse.json({ explanation, answer });
  } catch (err) {
    return aiErrorResponse(err);
  }
}
