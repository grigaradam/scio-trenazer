import { NextResponse } from "next/server";
import { z } from "zod";
import { levelUp, XP } from "@/lib/gamification";
import { acceptedOf, partCorrect } from "@/lib/scoring";
import { checkAchievements, recordActivity } from "@/lib/server/activity";
import { BASIC } from "@/lib/plans";
import { apiUser, getPlan } from "@/lib/server/auth";
import { practiceToday } from "@/lib/server/queries";
import { resolveTask } from "@/lib/server/tasks";
import { createAdminClient } from "@/lib/supabase/admin";

// option letters, or a typed word (AJ word formation)
const Key = z.string().max(40).nullable();
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
  // Basic: the daily cap (next stops serving at the limit; the slack lets a multi-question task finish)
  if ((await getPlan(user.id)) === "basic" && (await practiceToday(user.id)) >= BASIC.dailyTasks + 4) {
    return NextResponse.json({ error: "Dnešní úlohy v Basic máš vyčerpané." }, { status: 403 });
  }
  const task = await resolveTask(body.ref);
  if (!task) return NextResponse.json({ error: "Úloha nenalezena" }, { status: 404 });
  const admin = createAdminClient();

  const parts = task.question.parts;
  const correct = parts.every((p, i) => Boolean(body.answer[i]) && partCorrect(p, body.answer[i]!));

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
      xp += XP.mistakeFixed - XP.practiceCorrect;
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
  const ach = await checkAchievements(user.id);
  const after = ach.profile ?? profile;
  const show = correct || body.reveal;
  return NextResponse.json({
    correct,
    fixed,
    xp,
    achievements: ach.codes,
    achievementXp: ach.xp,
    levelUp: profile && after ? levelUp(profile.xp - xp, after.xp) : null,
    streak: profile?.streak_current ?? null,
    ...(show ? { answer: parts.map((p) => p.answer), accepted: acceptedOf(parts), solution: task.question.solution } : {}),
  });
}
