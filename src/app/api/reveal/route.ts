import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/server/auth";
import { resolveTask } from "@/lib/server/tasks";

// Reveal key + short solution of a task the user has already worked on.
export async function POST(req: Request) {
  const { error } = await apiUser();
  if (error) return error;
  const { ref } = z.object({ ref: z.string() }).parse(await req.json());
  const task = await resolveTask(ref);
  if (!task) return NextResponse.json({ error: "Úloha nenalezena" }, { status: 404 });
  return NextResponse.json({ answer: task.question.parts.map((p) => p.answer), solution: task.question.solution });
}
