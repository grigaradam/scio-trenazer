import { NextResponse } from "next/server";
import { getTest } from "@/lib/content/load";
import { emptySection, type TestResult } from "@/lib/scoring";
import { apiUser } from "@/lib/server/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Reopen a finished test so its empty section can be filled in – once per attempt. The other
// section keeps its answers and gets no time, so only the empty one is worked on.
export async function POST(_req: Request, ctx: RouteContext<"/api/attempts/[id]/retake">) {
  const { id } = await ctx.params;
  const { user, error } = await apiUser();
  if (error) return error;
  const admin = createAdminClient();
  const { data: attempt, error: selError } = await admin
    .from("attempts")
    .select("id,test_id,status,result,retake_section")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (selError) return NextResponse.json({ error: "Spusť v Supabase migraci 0007_section_retake.sql." }, { status: 409 });
  if (!attempt) return NextResponse.json({ error: "Nenalezeno" }, { status: 404 });
  if (attempt.status === "in_progress" && attempt.retake_section) return NextResponse.json({ ok: true });
  if (attempt.status !== "completed" || !attempt.result) return NextResponse.json({ error: "Test ještě není odevzdaný" }, { status: 409 });
  if (attempt.retake_section) return NextResponse.json({ error: "Oddíl už jsi jednou dodělával." }, { status: 409 });

  const section = emptySection(attempt.result as TestResult);
  if (!section) return NextResponse.json({ error: "Oba oddíly mají odpovědi – není co dodělat." }, { status: 409 });
  const test = getTest(attempt.test_id);
  if (!test) return NextResponse.json({ error: "Test nenalezen" }, { status: 404 });
  const full = test.sections.find((s) => s.id === section)!.timeLimitSec;

  const { error: upError } = await admin
    .from("attempts")
    .update({
      status: "in_progress",
      retake_section: section,
      section_index: section === "verbal" ? 0 : 1,
      time_left: { verbal: section === "verbal" ? full : 0, analytic: section === "analytic" ? full : 0 },
      flags: [],
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "completed");
  if (upError) return NextResponse.json({ error: upError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
