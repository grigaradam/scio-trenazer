import { NextResponse } from "next/server";
import { z } from "zod";
import { ACHIEVEMENTS } from "@/lib/gamification";
import { adminGuard } from "@/lib/server/admin-auth";
import { setAchievement, setPet, setXp, testerState, undo } from "@/lib/server/tester";

const Share = z.number().min(0).max(1).optional();
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("xp"), userId: z.string().uuid(), xp: z.number().int().min(0).max(10_000_000) }),
  z.object({
    action: z.literal("achievement"),
    userId: z.string().uuid(),
    code: z.string().refine((c) => ACHIEVEMENTS.some((a) => a.code === c)),
    on: z.boolean(),
  }),
  z.object({
    action: z.literal("pet"),
    userId: z.string().uuid(),
    pet: z.object({ hunger: Share, energy: Share, joy: Share, idleDays: z.number().int().min(0).max(30).optional() }).nullable(),
  }),
  z.object({ action: z.literal("undo"), userId: z.string().uuid() }),
]);

// Admin test mode for one account: read its state, change level / achievements / pet, undo it all.
export async function GET(req: Request) {
  const denied = await adminGuard();
  if (denied) return denied;
  const userId = z.string().uuid().parse(new URL(req.url).searchParams.get("userId"));
  return NextResponse.json(await testerState(userId));
}

export async function POST(req: Request) {
  const denied = await adminGuard();
  if (denied) return denied;
  const body = Body.parse(await req.json());
  try {
    if (body.action === "xp") await setXp(body.userId, body.xp);
    else if (body.action === "achievement") await setAchievement(body.userId, body.code, body.on);
    else if (body.action === "pet") await setPet(body.userId, body.pet);
    else await undo(body.userId);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
  return NextResponse.json(await testerState(body.userId));
}
