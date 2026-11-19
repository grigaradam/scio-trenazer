"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./ui";

/** Self-service account deletion with a typed confirmation. */
export function DeleteAccount() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: text.trim().toUpperCase() }) }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    if (!r?.ok) {
      setBusy(false);
      setError(j?.error ?? "Účet se nepodařilo smazat.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-sm font-bold text-muted underline underline-offset-2 hover:text-rose-600">
        Smazat účet
      </button>
      <Modal open={open} onClose={() => !busy && setOpen(false)}>
        <h2 className="font-display text-xl font-extrabold">Smazat účet?</h2>
        <p className="mt-2 text-sm text-muted">
          Smažeme profil, výsledky testů, chyby, statistiky, XP i profilový obrázek. Nejde to vrátit a nevyčerpaný přístup tím propadá. Pokud
          chceš do 14 dnů od zaplacení odstoupit od smlouvy a dostat peníze zpět, použij nejdřív{" "}
          <a href="/odstoupeni" className="font-bold underline underline-offset-2">
            Odstoupit od smlouvy
          </a>
          .
        </p>
        <label className="mt-4 block text-sm font-bold">
          Pro potvrzení napiš SMAZAT
          <input
            className="mt-1 h-12 w-full rounded-2xl border-2 border-border bg-surface px-4 font-mono uppercase outline-none focus:border-rose-500"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoComplete="off"
          />
        </label>
        {error && <p className="mt-2 rounded-xl bg-rose-100 px-3 py-2 text-sm font-medium text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">{error}</p>}
        <div className="mt-4 flex gap-2">
          <Button variant="danger" loading={busy} disabled={text.trim().toUpperCase() !== "SMAZAT"} onClick={remove}>
            Smazat účet natrvalo
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
            Zrušit
          </Button>
        </div>
      </Modal>
    </>
  );
}
