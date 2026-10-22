import { NextResponse } from "next/server";
import { z } from "zod";
import { recordActivity } from "@/lib/server/activity";
import { apiUser } from "@/lib/server/auth";

// Heartbeat with actively spent study seconds (tab visible) – feeds the daily heatmap and goal.
export async function POST(req: Request) {
  const { user, error } = await apiUser();
  if (error) return error;
  const { seconds } = z.object({ seconds: z.number().min(0).max(180) }).parse(await req.json());
  if (seconds >= 1) await recordActivity(user.id, { seconds });
  return NextResponse.json({ ok: true });
}
