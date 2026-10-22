import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// E-mail confirmation / magic-link landing: exchange the code for a session.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/app";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next.startsWith("/") ? next : "/app", url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=confirm", url.origin));
}
