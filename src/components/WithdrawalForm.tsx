"use client";

import { useState } from "react";
import { Button } from "./ui";

interface Fields {
  name: string;
  email: string;
  contract: string;
  paid_on: string;
  address: string;
  bank_account: string;
  reason: string;
  website: string;
}

interface Done {
  ref: string;
  created_at: string;
  statement: string;
  email: string;
}

const EMPTY: Fields = { name: "", email: "", contract: "", paid_on: "", address: "", bank_account: "", reason: "", website: "" };

const input =
  "h-12 w-full rounded-2xl border-2 border-border bg-surface px-4 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15";

const when = (iso: string) =>
  new Date(iso).toLocaleString("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Two-step online withdrawal (§ 1830a OZ): fill in → "Potvrdit odstoupení od smlouvy" → receipt. */
export function WithdrawalForm() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [f, setF] = useState<Fields>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  if (done) {
    const receipt =
      `Potvrzení o přijetí odstoupení od smlouvy ${done.ref}\n\n` +
      `Dne ${when(done.created_at)} jsme přijali toto odstoupení od smlouvy:\n„${done.statement}“\n\n` +
      `Peníze vrátíme do 14 dnů od doručení odstoupení stejným způsobem, jakým jsi platil(a). ` +
      `Pokud jsi přístupový kód už uplatnil(a), odečteme poměrnou část za dobu přístupu (čl. 12.5 obchodních podmínek).\n\n` +
      `Adam Grigar, IČO 23007966, Tyršova 843, 357 35 Chodov, grigar.adam@gmail.com`;
    return (
      <div role="status" className="mt-6 rounded-3xl border-2 border-emerald-500 bg-emerald-50 p-5 dark:bg-emerald-900/20">
        <div className="font-display text-lg font-extrabold">Odstoupení jsme přijali ✓</div>
        <p className="mt-2 text-sm">
          Odstoupení od smlouvy <strong>{done.ref}</strong> jsme přijali {when(done.created_at)}. Potvrzení s obsahem odstoupení a datem a
          časem odeslání ti bez zbytečného odkladu pošleme na <strong>{done.email}</strong>.
        </p>
        <p className="mt-2 rounded-2xl bg-surface p-3 text-sm italic">„{done.statement}“</p>
        <p className="mt-2 text-sm">
          Peníze vrátíme do 14 dnů od doručení odstoupení stejným způsobem, jakým jsi platil(a). Pokud jsi kód už uplatnil(a), odečteme
          poměrnou část za dobu přístupu.
        </p>
        <a
          className="mt-3 inline-block text-sm font-bold text-brand-600 underline underline-offset-2 dark:text-brand-300"
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(receipt)}`}
          download={`odstoupeni-${done.ref}.txt`}
        >
          Stáhnout potvrzení
        </a>
      </div>
    );
  }

  if (!open)
    return (
      <div className="mt-6 rounded-3xl border-2 border-border bg-surface p-5">
        <p className="text-sm text-muted">
          Koupil(a) jsi placený přístup a chceš do 14 dnů od zaplacení odstoupit? Stačí vyplnit krátký formulář, důvod uvádět nemusíš.
        </p>
        <Button className="mt-3" onClick={() => setOpen(true)}>
          Odstoupit od smlouvy
        </Button>
      </div>
    );

  async function confirm() {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/withdrawal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setBusy(false);
    if (!r?.ok) {
      setError(j?.error ?? "Odstoupení se nepodařilo odeslat. Pošli ho prosím e-mailem na grigar.adam@gmail.com.");
      return;
    }
    setDone(j as Done);
  }

  return (
    <div className="mt-6 rounded-3xl border-2 border-border bg-surface p-5">
      <div className="text-xs font-extrabold uppercase tracking-wider text-muted">Krok {step} ze 2</div>
      {step === 1 ? (
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setStep(2);
          }}
        >
          <label className="block text-sm font-bold">
            Jméno a příjmení
            <input className={`${input} mt-1`} required minLength={2} maxLength={120} autoComplete="name" value={f.name} onChange={set("name")} />
          </label>
          <label className="block text-sm font-bold">
            E-mail pro potvrzení
            <input className={`${input} mt-1`} type="email" required autoComplete="email" value={f.email} onChange={set("email")} />
          </label>
          <label className="block text-sm font-bold">
            Přístupový kód nebo e-mail účtu
            <input className={`${input} mt-1`} required minLength={3} maxLength={200} autoComplete="off" value={f.contract} onChange={set("contract")} />
          </label>
          <details className="text-sm">
            <summary className="cursor-pointer font-bold text-muted">Nepovinné údaje</summary>
            <div className="mt-2 space-y-3">
              <label className="block font-bold">
                Datum objednání nebo zaplacení (nepovinné)
                <input className={`${input} mt-1`} maxLength={40} value={f.paid_on} onChange={set("paid_on")} />
              </label>
              <label className="block font-bold">
                Adresa (nepovinné)
                <input className={`${input} mt-1`} maxLength={300} autoComplete="street-address" value={f.address} onChange={set("address")} />
              </label>
              <label className="block font-bold">
                Číslo účtu pro vrácení peněz (nepovinné)
                <input className={`${input} mt-1`} maxLength={60} value={f.bank_account} onChange={set("bank_account")} />
              </label>
              <label className="block font-bold">
                Důvod (nepovinné)
                <textarea className={`${input} mt-1 h-24 py-3`} maxLength={1000} value={f.reason} onChange={set("reason")} />
              </label>
            </div>
          </details>
          <input className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={set("website")} />
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="submit">Pokračovat</Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Zrušit
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-3 space-y-3 text-sm">
          <p>
            Chystáš se odstoupit od smlouvy o přístupu do aplikace Nanečisto (<strong>{f.contract}</strong>). Potvrzení ti pošleme na{" "}
            <strong>{f.email}</strong>.
          </p>
          {error && <p className="rounded-xl bg-rose-100 px-3 py-2 font-medium text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" loading={busy} onClick={confirm}>
              Potvrdit odstoupení od smlouvy
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setStep(1)}>
              Zpět
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
