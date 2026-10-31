import { NextResponse } from "next/server";
import { z } from "zod";
import { getTest, getTests } from "@/lib/content/load";
import { apiUser, getPlan } from "@/lib/server/auth";
import { basicTestId } from "@/lib/server/queries";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({ testId: z.string().optional(), diagnostic: z.boolean().optional() });

// Start a full test. Without testId picks the newest test the user hasn't completed yet.
export async function POST(req: Request) {
  const { user, error } = await apiUser();
  if (error) return error;
  const body = Body.parse(await req.json().catch(() => ({})));
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("attempts")
    .select("id,test_id,status,started_at")
    .eq("user_id", user.id)
    .order("started_at", { ascending: false });

  const open = (existing ?? []).find((a) => a.status === "in_progress" && (!body.testId || a.test_id === body.testId));
  if (open) return NextResponse.json({ id: open.id, resumed: true });

  let testId = body.testId;
  // Basic: one test – the first one started stays its test, retakes included
  const own = (await getPlan(user.id)) === "basic" ? basicTestId(existing ?? []) : null;
  if (own) {
    if (testId && testId !== own) return NextResponse.json({ error: "V Basic máš jeden test. Další testy jsou v Pro." }, { status: 403 });
    testId = own;
  }
  if (!testId) {
    const done = new Set((existing ?? []).map((a) => a.test_id));
    const tests = getTests("osp");
    testId = (tests.find((t) => !done.has(t.id)) ?? tests[0])?.id;
  }
  const test = testId ? getTest(testId) : undefined;
  if (!test) return NextResponse.json({ error: "Test nenalezen" }, { status: 404 });

  const timeLeft = Object.fromEntries(test.sections.map((s) => [s.id, s.timeLimitSec]));
  const { data, error: dbError } = await admin
    .from("attempts")
    .insert({
      user_id: user.id,
      exam: test.exam,
      test_id: test.id,
      is_diagnostic: Boolean(body.diagnostic) || !(existing ?? []).length,
      time_left: timeLeft,
    })
    .select("id")
    .single();
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ id: data.id, resumed: false });
}
