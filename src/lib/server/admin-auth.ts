import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// Admin login for /dashboard. Credentials live in Vercel env (ADMIN_USERNAME, ADMIN_PASSWORD);
// the session is a signed, httpOnly cookie – no admin account in the database.

const COOKIE = "admin_session";
const MAX_AGE = 7 * 24 * 3600;

export function adminConfigured() {
  return Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD);
}

function key() {
  // changing the password invalidates every admin session
  return createHash("sha256")
    .update(`${process.env.ADMIN_PASSWORD ?? ""}:${process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`)
    .digest();
}

const sign = (payload: string) => createHmac("sha256", key()).update(payload).digest("base64url");

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkCredentials(username: string, password: string) {
  if (!adminConfigured()) return false;
  // compare both even if the first fails (constant-ish time)
  const u = safeEqual(username.trim(), process.env.ADMIN_USERNAME!.trim());
  const p = safeEqual(password, process.env.ADMIN_PASSWORD!);
  return u && p;
}

export async function setAdminSession() {
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE);
  (await cookies()).set(COOKIE, `${exp}.${sign(exp)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearAdminSession() {
  (await cookies()).delete(COOKIE);
}

export async function isAdmin() {
  if (!adminConfigured()) return false;
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || !safeEqual(sig, sign(exp))) return false;
  return Number(exp) > Date.now() / 1000;
}

/** For admin route handlers: null when OK, otherwise a 401 response. */
export async function adminGuard() {
  return (await isAdmin()) ? null : NextResponse.json({ error: "Jen pro admina" }, { status: 401 });
}
