"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { startNavProgress } from "./NavProgress";
import { Button } from "./ui";

export function ReactivateForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState(params.get("code") ?? "");
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
          body: JSON.stringify({ code }),
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
