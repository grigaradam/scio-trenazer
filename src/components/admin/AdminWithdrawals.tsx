"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card } from "../ui";

export interface WithdrawalRow {
  id: string;
  ref: string;
  name: string;
  email: string;
  contract: string;
  bank_account: string | null;
  reason: string | null;
  statement: string;
  created_at: string;
  handled_at: string | null;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Confirmation e-mail the law requires (§ 1830a OZ): content of the withdrawal + date and time it was sent. */
function mailto(w: WithdrawalRow) {
  const subject = `Potvrzení přijetí odstoupení od smlouvy ${w.ref}`;
  const body =
    `Dobrý den,\n\npotvrzujeme, že jsme ${when(w.created_at)} přijali toto odstoupení od smlouvy:\n„${w.statement}“\n\n` +
    `Peníze vrátíme do 14 dnů od doručení odstoupení stejným způsobem, jakým jste platil(a)` +
    `${w.bank_account ? ` (na účet ${w.bank_account})` : ""}. Pokud jste přístupový kód už uplatnil(a), odečteme poměrnou část za dobu přístupu podle čl. 12.5 obchodních podmínek. Přístup daný kódem tím končí.\n\n` +
    `S pozdravem\nAdam Grigar, IČO 23007966, Tyršova 843, 357 35 Chodov\nNanečisto – www.nanecisto.fun`;
  return `mailto:${w.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function AdminWithdrawals({ rows }: { rows: WithdrawalRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const open = rows.filter((r) => !r.handled_at).length;
  if (!rows.length) return null;
  return (
    <div className="mx-auto max-w-6xl px-4 pt-6">
      <Card className={open ? "border-rose-400" : undefined}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-display text-lg font-extrabold">Odstoupení od smlouvy</div>
          {open > 0 && <Badge tone="warn">{open} k vyřízení</Badge>}
        </div>
        <p className="mt-1 text-xs text-muted">
          Potvrzení pošli e-mailem bez zbytečného odkladu (ideálně ještě týž den), peníze vrať do 14 dnů. Přístup uživatele ukonči v sekci Uživatelé.
        </p>
        <ul className="mt-3 divide-y-2 divide-border text-sm">
          {rows.map((w) => (
            <li key={w.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="font-bold">
                  {w.ref} · {w.name} · {w.email}
                </div>
                <div className="text-muted">
                  {when(w.created_at)} · {w.contract}
                  {w.bank_account ? ` · účet ${w.bank_account}` : ""}
                </div>
                {w.reason && <div className="mt-1 text-muted">Důvod: {w.reason}</div>}
              </div>
              <div className="flex shrink-0 gap-2">
                <a href={mailto(w)} className="inline-flex h-9 items-center rounded-xl border-2 border-border px-3 font-bold hover:bg-surface-2">
                  Poslat potvrzení
                </a>
                <Button
                  size="sm"
                  variant={w.handled_at ? "ghost" : "success"}
                  loading={busy === w.id}
                  onClick={async () => {
                    setBusy(w.id);
                    await fetch("/api/admin/withdrawals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: w.id, handled: !w.handled_at }) });
                    setBusy(null);
                    router.refresh();
                  }}
                >
                  {w.handled_at ? "Vyřízeno ✓" : "Označit vyřízené"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
