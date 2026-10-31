import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PetOverride } from "@/lib/pet";
import type { TestOverride } from "./types";

// Admin test mode. Every change goes into profiles.test_override, so undo() restores exactly
// what was there before – whatever the student did in between (XP earned, achievements) stays.

const EMPTY: TestOverride = { xpOffset: 0, added: [], removed: [], pet: null };

export const isEmptyOverride = (o: TestOverride | null | undefined) =>
  !o || (!o.xpOffset && !o.added.length && !o.removed.length && !o.pet);

export async function testerState(userId: string) {
  const admin = createAdminClient();
  const [profileQ, achQ] = await Promise.all([
    admin.from("profiles").select("xp,test_override").eq("id", userId).single(),
    admin.from("achievements").select("code").eq("user_id", userId),
  ]);
  // without migration 0013 the column is missing → test mode is off
  if (profileQ.error) return { ready: false as const, error: profileQ.error.message };
  return {
    ready: true as const,
    xp: profileQ.data.xp as number,
    achievements: (achQ.data ?? []).map((a) => a.code as string),
    override: (profileQ.data.test_override as TestOverride | null) ?? EMPTY,
  };
}

async function load(userId: string) {
  const state = await testerState(userId);
  if (!state.ready) throw new Error("Spusť v Supabase migraci 0013_test_override.sql.");
  return state;
}

async function save(userId: string, override: TestOverride, extra: Record<string, unknown> = {}) {
  const { error } = await createAdminClient()
    .from("profiles")
    .update({ ...extra, test_override: isEmptyOverride(override) ? null : override })
    .eq("id", userId);
  if (error) throw new Error(error.message);
}

export async function setXp(userId: string, xp: number) {
  const s = await load(userId);
  const target = Math.max(0, Math.round(xp));
  await save(userId, { ...s.override, xpOffset: s.override.xpOffset + (target - s.xp) }, { xp: target });
}

export async function setAchievement(userId: string, code: string, on: boolean) {
  const s = await load(userId);
  const admin = createAdminClient();
  const o = { ...s.override, added: [...s.override.added], removed: [...s.override.removed] };
  const has = s.achievements.includes(code);
  if (on && !has) {
    const was = o.removed.find((r) => r.code === code);
    await admin.from("achievements").insert({ user_id: userId, code, ...(was ? { unlocked_at: was.unlocked_at } : {}) });
    if (was) o.removed = o.removed.filter((r) => r.code !== code);
    else o.added.push(code);
  } else if (!on && has) {
    const { data } = await admin.from("achievements").select("unlocked_at").eq("user_id", userId).eq("code", code).single();
    await admin.from("achievements").delete().eq("user_id", userId).eq("code", code);
    if (o.added.includes(code)) o.added = o.added.filter((c) => c !== code);
    else o.removed.push({ code, unlocked_at: data?.unlocked_at ?? new Date().toISOString() });
  }
  await save(userId, o);
}

export async function setPet(userId: string, pet: PetOverride | null) {
  const s = await load(userId);
  await save(userId, { ...s.override, pet: pet && Object.keys(pet).length ? pet : null });
}

/** Back to the real state: undoes the XP change, the achievements and the pet override. */
export async function undo(userId: string) {
  const s = await load(userId);
  const admin = createAdminClient();
  const o = s.override;
  if (o.added.length) await admin.from("achievements").delete().eq("user_id", userId).in("code", o.added);
  const back = o.removed.filter((r) => !s.achievements.includes(r.code));
  if (back.length) await admin.from("achievements").insert(back.map((r) => ({ user_id: userId, ...r })));
  await save(userId, EMPTY, { xp: Math.max(0, s.xp - o.xpOffset) });
}
