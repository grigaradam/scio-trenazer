import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/supabase/demo";

// Online withdrawal from the contract (§ 1830a OZ). Public – the buyer of a code may have no account.
// Only identification is required; reason and the rest stay optional, as the law demands.
const Body = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  contract: z.string().trim().min(3).max(200),
  paid_on: z.string().trim().max(40).optional().default(""),
  address: z.string().trim().max(300).optional().default(""),
  bank_account: z.string().trim().max(60).optional().default(""),
  reason: z.string().trim().max(1000).optional().default(""),
  website: z.string().max(0).optional(), // honeypot
});

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newRef = () => "OD-" + Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

function withdrawalStatement(b: { name: string; contract: string; paid_on?: string }) {
  return (
    `Oznamuji, že tímto odstupuji od smlouvy o poskytnutí služby – přístup do aplikace Nanečisto` +
    ` (přístupový kód / účet: ${b.contract}${b.paid_on ? `, datum objednání / zaplacení: ${b.paid_on}` : ""}).` +
    ` Spotřebitel: ${b.name}.`
  );
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Vyplň jméno, platný e-mail a přístupový kód nebo e-mail účtu." }, { status: 400 });
  }
  const b = parsed.data;
  if (b.website) return NextResponse.json({ error: "Neplatný požadavek." }, { status: 400 });

  const admin = createAdminClient();
  // simple flood guard: max 5 withdrawals per e-mail per hour
  if (!isDemo()) {
    const { count } = await admin
      .from("withdrawals")
      .select("id", { count: "exact", head: true })
      .eq("email", b.email)
      .gte("created_at", new Date(Date.now() - 3600_000).toISOString());
    if ((count ?? 0) >= 5) return NextResponse.json({ error: "Odstoupení už jsme přijali. Zkus to případně za hodinu nebo nám napiš e-mail." }, { status: 429 });
  }

  let userId: string | null = null;
  if (!isDemo()) {
    const { data } = await (await createClient()).auth.getClaims().catch(() => ({ data: null }));
    userId = (data?.claims?.sub as string | undefined) ?? null;
  }

  const statement = withdrawalStatement(b);
  const row = {
    id: crypto.randomUUID(),
    ref: newRef(),
    name: b.name,
    email: b.email,
    contract: b.contract,
    paid_on: b.paid_on || null,
    address: b.address || null,
    bank_account: b.bank_account || null,
    reason: b.reason || null,
    statement,
    user_id: userId,
    created_at: new Date().toISOString(),
  };
  const { error } = await admin.from("withdrawals").insert(row);
  if (error) {
    console.error("withdrawal insert", error.message);
    return NextResponse.json(
      { error: "Odstoupení se nepodařilo uložit. Pošli ho prosím e-mailem na grigar.adam@gmail.com – lhůta tím zůstane zachována." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ref: row.ref, created_at: row.created_at, statement, email: b.email });
}
