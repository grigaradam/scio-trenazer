import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/server/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({
  display_name: z.string().trim().min(1).max(40).optional(),
  exam: z.enum(["osp"]).optional(),
  onboarded: z.boolean().optional(),
  daily_goal_min: z.number().int().min(5).max(240).optional(),
  practice_time_limit_sec: z.number().int().min(15).max(900).nullable().optional(),
});

export async function PATCH(req: Request) {
  const { user, error } = await apiUser();
  if (error) return error;
  const body = Body.parse(await req.json());
  const { error: dbError } = await createAdminClient().from("profiles").update(body).eq("id", user.id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
