import "server-only";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "./types";

/** For pages: the signed-in user or a redirect to /login. */
export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return { user: data.user, supabase };
}

/** For route handlers: the user, or a 401 response to return. */
export async function apiUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { user: null, error: NextResponse.json({ error: "Nepřihlášen" }, { status: 401 }) } as const;
  return { user: data.user, error: null } as const;
}

export async function getProfile(userId: string): Promise<Profile> {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (data) return data as Profile;
  // Trigger may not have run (e.g. user created before migration) – create lazily.
  const { data: created } = await admin.from("profiles").upsert({ id: userId }).select("*").single();
  return created as Profile;
}
