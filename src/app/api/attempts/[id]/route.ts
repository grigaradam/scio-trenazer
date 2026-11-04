import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/server/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// option letters, or a typed word (AJ word formation)
const Key = z.string().max(40).nullable();
const Body = z.object({
  answers: z.record(z.string(), z.array(Key)).optional(),
  flags: z.array(z.number().int()).optional(),
  // only the sections of this attempt's test are kept (see below); zod 4 would require every key of an enum record
  timeLeft: z.record(z.string(), z.number()).optional(),
  sectionIndex: z.number().int().min(0).max(1).optional(),
  pause: z.boolean().optional(),
  activeSeconds: z.number().min(0).max(600).optional(),
});

// Autosave of an in-progress attempt.
export async function PATCH(req: Request, ctx: RouteContext<"/api/attempts/[id]">) {
  const { id } = await ctx.params;
  const { user, error } = await apiUser();
  if (error) return error;
  const body = Body.parse(await req.json());
  const admin = createAdminClient();
  const { data: attempt } = await admin
    .from("attempts")
    .select("id,status,section_index,time_left,pause_count,active_seconds")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!attempt) return NextResponse.json({ error: "Nenalezeno" }, { status: 404 });
  if (attempt.status !== "in_progress") return NextResponse.json({ error: "Test už je odevzdaný" }, { status: 409 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.answers) update.answers = body.answers;
  if (body.flags) update.flags = body.flags;
  if (body.timeLeft) {
    // time can only go down
    const prev = attempt.time_left as Record<string, number>;
    update.time_left = Object.fromEntries(
      Object.entries(prev).map(([k, v]) => {
        const next = body.timeLeft?.[k];
        return [k, next === undefined ? v : Math.max(0, Math.min(v, Math.round(next)))];
      }),
    );
  }
  // sections only move forward
  if (body.sectionIndex !== undefined) update.section_index = Math.max(attempt.section_index, body.sectionIndex);
  if (body.pause) update.pause_count = attempt.pause_count + 1;
  if (body.activeSeconds) update.active_seconds = attempt.active_seconds + Math.round(body.activeSeconds);

  const { error: dbError } = await admin.from("attempts").update(update).eq("id", id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Abandon an attempt (delete it) – only in-progress ones.
export async function DELETE(_req: Request, ctx: RouteContext<"/api/attempts/[id]">) {
  const { id } = await ctx.params;
  const { user, error } = await apiUser();
  if (error) return error;
  const admin = createAdminClient();
  await admin.from("attempts").delete().eq("id", id).eq("user_id", user.id).eq("status", "in_progress");
  return NextResponse.json({ ok: true });
}
