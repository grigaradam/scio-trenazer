import { NextResponse } from "next/server";
import { z } from "zod";
import { XP } from "@/lib/gamification";
import { checkAchievements, recordActivity } from "@/lib/server/activity";
import { apiUser } from "@/lib/server/auth";
import { resolveTask } from "@/lib/server/tasks";
import { createAdminClient } from "@/lib/supabase/admin";

const Key = z.enum(["A", "B", "C", "D", "E", "F", "G", "H"]).nullable();
const Body = z.object({
  ref: z.string(),
  answer: z.array(Key),
  timeMs: z.number().int().min(0).optional(),
  timeLimitSec: z.number().int().positive().nullable().optional(),
  /** false = "zkus to přepočítat": only say right/wrong, don't reveal the key */
  reveal: z.boolean().default(true),
});

export async function POST(req: Request) {
  const { user, error } = await apiUser();
  if (error) return error;
  const body = Body.parse(await req.json());
  const task = await resolveTask(body.ref);
  if (!task) return NextResponse.json({ error: "Úloha nenalezena" }, { status: 404 });
  const admin = createAdminClient();

  const parts = task.question.parts;
  const correct = parts.every((p, i) => body.answer[i] === p.answer || (body.answer[i] && p.alsoAccepted?.includes(body.answer[i]!)));

  await admin.from("practice_answers").insert({
    user_id: user.id,
    task_ref: task.ref,
    task_type: task.taskType,
    correct,
    answer: body.answer,
    time_ms: body.timeMs ?? null,
  });

  const { data: mistake } = await admin
    .from("mistakes")
    .select("id,status,tries")
    .eq("user_id", user.id)
    .eq("task_ref", task.ref)
    .maybeSingle();

  let xp = correct ? XP.practiceCorrect : XP.practiceWrong;
  if (correct && body.timeLimitSec && body.timeMs !== undefined && body.timeMs < (body.timeLimitSec * 1000) / 2) xp += XP.fastBonus;
  let fixed = false;
  if (mistake) {
    if (correct && mistake.status === "open") {
      fixed = true;
      xp += XP.mistakeFixed;
    }
    await admin
      .from("mistakes")
      .update({ status: correct ? "fixed" : "open", tries: mistake.tries + 1, updated_at: new Date().toISOString() })
      .eq("id", mistake.id);
  } else if (!correct) {
    await admin.from("mistakes").insert({
      user_id: user.id,
      task_ref: task.ref,
      task_type: task.taskType,
      source: task.origin.kind === "test" ? "test" : "practice",
      tries: 1,
    });
  }

  const profile = await recordActivity(user.id, { tasks: 1, correct: correct ? 1 : 0, xp });
  const achievements = await checkAchievements(user.id);
  const show = correct || body.reveal;
  return NextResponse.json({
    correct,
    fixed,
    xp,
    achievements,
    streak: profile?.streak_current ?? null,
    ...(show ? { answer: parts.map((p) => p.answer), solution: task.question.solution } : {}),
  });
}
