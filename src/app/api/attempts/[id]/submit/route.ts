import { NextResponse } from "next/server";
import { z } from "zod";
import { getTest } from "@/lib/content/load";
import { testRef } from "@/lib/content/public";
import { XP } from "@/lib/gamification";
import { scoreTest } from "@/lib/scoring";
import { checkAchievements, recordActivity } from "@/lib/server/activity";
import { apiUser } from "@/lib/server/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const Key = z.enum(["A", "B", "C", "D", "E", "F", "G", "H"]).nullable();
const Body = z.object({
  answers: z.record(z.string(), z.array(Key)).optional(),
  activeSeconds: z.number().min(0).max(600).optional(),
});

// Grade the attempt on the server, store result + mistakes, award XP and achievements.
export async function POST(req: Request, ctx: RouteContext<"/api/attempts/[id]/submit">) {
  const { id } = await ctx.params;
  const { user, error } = await apiUser();
  if (error) return error;
  const body = Body.parse(await req.json().catch(() => ({})));
  const admin = createAdminClient();
  const { data: attempt } = await admin.from("attempts").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!attempt) return NextResponse.json({ error: "Nenalezeno" }, { status: 404 });
  if (attempt.status === "completed") return NextResponse.json({ ok: true, already: true });

  const test = getTest(attempt.test_id);
  if (!test) return NextResponse.json({ error: "Test nenalezen" }, { status: 404 });
  const answers = body.answers ?? attempt.answers ?? {};
  const result = scoreTest(test, answers);
  const activeSeconds = (attempt.active_seconds ?? 0) + Math.round(body.activeSeconds ?? 0);
  // a retake of one section keeps the original finish date so the test history isn't reordered
  const retake = attempt.retake_section as "verbal" | "analytic" | null | undefined;

  const { error: upErr } = await admin
    .from("attempts")
    .update({
      status: "completed",
      answers,
      completed_at: retake && attempt.completed_at ? attempt.completed_at : new Date().toISOString(),
      updated_at: new Date().toISOString(),
      score: result.score,
      max_score: result.maxScore,
      result,
      active_seconds: activeSeconds,
    })
    .eq("id", id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Mistakes: wrong, partial and blank questions go to the review list.
  const missed = result.questions.filter((q) => q.status !== "correct");
  if (missed.length) {
    await admin.from("mistakes").upsert(
      missed.map((q) => ({
        user_id: user.id,
        exam: test.exam,
        task_ref: testRef(test.id, q.n),
        task_type: q.taskType,
        source: "test",
        attempt_id: id,
        status: "open",
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "user_id,task_ref" },
    );
  }

  // Questions of the retaken section that were blank before and are right now came in as
  // mistakes with the first submit; drop those the student hasn't touched since.
  if (retake) {
    const fixed = result.questions.filter((q) => q.section === retake && q.status === "correct");
    if (fixed.length) {
      await admin
        .from("mistakes")
        .delete()
        .eq("user_id", user.id)
        .eq("attempt_id", id)
        .eq("tries", 0)
        .in("task_ref", fixed.map((q) => testRef(test.id, q.n)));
    }
  }

  // a retake only counts its own section and the points it added – no second completion bonus
  const counted = retake ? result.questions.filter((q) => q.section === retake) : result.questions;
  const correctCount = counted.filter((q) => q.status === "correct").length;
  const xp = retake
    ? Math.max(0, Math.round((result.score - Number(attempt.score ?? 0)) * XP.testPerPoint))
    : XP.testCompleted + Math.max(0, Math.round(result.score * XP.testPerPoint));
  // active test time is already counted by heartbeats; here we count the tasks
  await recordActivity(user.id, { tasks: counted.length, correct: correctCount, xp });
  const achievements = await checkAchievements(user.id);
  return NextResponse.json({ ok: true, xp, achievements });
}
