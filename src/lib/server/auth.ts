import "server-only";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEMO_USER, isDemo } from "@/lib/supabase/demo";
import type { Profile } from "./types";

export interface SessionUser {
  id: string;
  email: string | null;
}

/**
 * Current user from the session JWT. getClaims() verifies the token locally (no round trip to
 * Supabase Auth when the project uses asymmetric signing keys). Cached per request, so layout
 * and page share one lookup.
 */
const currentUser = cache(async (): Promise<SessionUser | null> => {
  if (isDemo()) return DEMO_USER;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: (claims.email as string | undefined) ?? null };
});

/**
 * For pages: the signed-in user or a redirect to /login. Blocked accounts go to /reactivate.
 * A session whose account no longer exists (deleted in Supabase, the JWT is still valid) is signed out.
 */
export async function requireUser(opts: { allowBlocked?: boolean } = {}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const profile = await findProfile(user.id);
  if (!profile) redirect("/auth/signout?gone=1");
  if (!opts.allowBlocked && profile.blocked) redirect("/reactivate");
  return { user };
}

/** For route handlers: the user, or a 401/403 response to return. */
export async function apiUser(opts: { allowBlocked?: boolean } = {}) {
  const user = await currentUser();
  const profile = user && (await findProfile(user.id));
  if (!user || !profile) return { user: null, error: NextResponse.json({ error: "Nepřihlášen" }, { status: 401 }) } as const;
  if (!opts.allowBlocked && profile.blocked) {
    return {
      user: null,
      error: NextResponse.json({ error: "Platnost přístupu vypršela – zadej nový přístupový kód.", blocked: true }, { status: 403 }),
    } as const;
  }
  return { user, error: null } as const;
}

/** The user's profile, or null when the auth user is gone (the lazy insert then fails on the foreign key). */
const findProfile = cache(async (userId: string): Promise<Profile | null> => {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (data) return data as Profile;
  // Trigger may not have run (e.g. user created before migration) – create lazily.
  const { data: created, error } = await admin.from("profiles").upsert({ id: userId }).select("*").single();
  if (error) console.error("getProfile", userId, error.message);
  return (created as Profile | null) ?? null;
});

/** Profile of a user that requireUser/apiUser already let through, so it exists. */
export async function getProfile(userId: string): Promise<Profile> {
  const profile = await findProfile(userId);
  if (!profile) throw new Error(`Profil ${userId} neexistuje`);
  return profile;
}
