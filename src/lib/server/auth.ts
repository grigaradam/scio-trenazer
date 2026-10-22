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

/** For pages: the signed-in user or a redirect to /login. */
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return { user };
}

/** For route handlers: the user, or a 401 response to return. */
export async function apiUser() {
  const user = await currentUser();
  if (!user) return { user: null, error: NextResponse.json({ error: "Nepřihlášen" }, { status: 401 }) } as const;
  return { user, error: null } as const;
}

export const getProfile = cache(async (userId: string): Promise<Profile> => {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (data) return data as Profile;
  // Trigger may not have run (e.g. user created before migration) – create lazily.
  const { data: created } = await admin.from("profiles").upsert({ id: userId }).select("*").single();
  return created as Profile;
});
