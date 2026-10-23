import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}

/**
 * Redirect target of requireUser when the session's account no longer exists. The session cookies
 * are dropped by hand too: the proxy only checks the JWT locally, so a cookie left behind would send
 * /login straight back to /app.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  const response = NextResponse.redirect(new URL("/login?error=gone", request.url), { status: 303 });
  const cookies = request.headers.get("cookie") ?? "";
  for (const name of cookies.split(";").map((c) => c.split("=")[0].trim())) {
    if (name.startsWith("sb-")) response.cookies.delete(name);
  }
  return response;
}
