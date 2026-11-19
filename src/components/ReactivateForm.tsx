"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { startNavProgress } from "./NavProgress";
import { Button } from "./ui";

export function ReactivateForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [terms, setTerms] = useState(false);
  const [start, setStart] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const r = await fetch("/api/reactivate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, terms, start }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          setError(j.error ?? "Kód se nepodařilo ověřit.");
          setBusy(false);
          return;
        }
        startNavProgress();
        router.replace("/app");
        router.refresh();
      }}
    >
      <input
        className="h-12 w-full rounded-2xl border-2 border-border bg-surface px-4 font-mono uppercase tracking-widest outline-none focus:border-brand-500"
        required
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="XXXX-XXXX"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <div className="space-y-2 text-sm">
        <label className="flex cursor-pointer gap-2.5">
          <input type="checkbox" required checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600" />
          <span>
            Přijímám{" "}
            <Link href="/obchodni-podminky" target="_blank" className="font-bold text-brand-600 underline underline-offset-2">
              obchodní podmínky
            </Link>
            .
          </span>
        </label>
        <label className="flex cursor-pointer gap-2.5">
          <input type="checkbox" required checked={start} onChange={(e) => setStart(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600" />
          <span>
            Žádám, aby mi přístup začal hned. Beru na vědomí, že když u placeného přístupu do 14 dnů od zaplacení odstoupím od smlouvy,
            zaplatím poměrnou část ceny za dobu, po kterou jsem měl(a) přístup.
          </span>
        </label>
      </div>
      {error && <p className="rounded-xl bg-rose-100 px-3 py-2 text-sm font-medium text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">{error}</p>}
      <Button type="submit" size="lg" className="w-full" loading={busy}>
        Obnovit přístup
      </Button>
      <button
        type="button"
        onClick={async () => {
          await fetch("/auth/signout", { method: "POST" });
          router.replace("/");
          router.refresh();
        }}
        className="w-full text-center text-sm font-bold text-muted hover:text-text"
      >
        Odhlásit se
      </button>
    </form>
  );
}
