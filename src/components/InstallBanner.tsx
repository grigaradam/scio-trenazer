"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { installPlatform, promptInstall } from "@/lib/install";
import { AppIcon } from "@/lib/appIcon";
import { InstallGuide, useCanPrompt } from "./InstallGuide";
import { Modal } from "./Modal";

const DISMISS_KEY = "install-banner-dismissed";
const DISMISS_DAYS = 14;

/** Phone users who still use the site in the browser get a nudge to add it to the home screen. */
export function InstallBanner() {
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  const canPrompt = useCanPrompt();

  useEffect(() => {
    const platform = installPlatform();
    if (platform === "standalone" || platform === "desktop") return;
    let dismissedAt = 0;
    try {
      dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- platform and storage are only known in the browser
    if (Date.now() - dismissedAt > DISMISS_DAYS * 864e5) setShow(true);
  }, []);

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
  }

  if (!show) return null;
  return (
    <>
      <div className="mb-6 flex animate-fade-up items-center gap-3 rounded-2xl border-2 border-brand-200 bg-brand-50 p-3 dark:border-brand-800 dark:bg-brand-900/30">
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-[22%] shadow">
          <AppIcon size={44} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-extrabold">Přidej si Nanečisto na plochu</div>
          <div className="text-xs text-muted">Otevřeš ho jedním klepnutím a můžeš dostávat připomínky.</div>
        </div>
        <button
          type="button"
          onClick={async () => (canPrompt ? (await promptInstall()) && setShow(false) : setOpen(true))}
          className="flex shrink-0 items-center gap-1 rounded-xl bg-brand-500 px-3 py-2 text-sm font-bold text-white"
        >
          {canPrompt && <Plus className="h-4 w-4" />}
          {canPrompt ? "Přidat" : "Jak na to"}
        </button>
        <button type="button" onClick={dismiss} aria-label="Zavřít" className="shrink-0 rounded-lg p-1 text-muted hover:text-text">
          <X className="h-4 w-4" />
        </button>
      </div>
      <Modal open={open} onClose={() => setOpen(false)}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-extrabold">Přidat na plochu</h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="Zavřít" className="rounded-lg p-1 text-muted hover:text-text">
            <X className="h-5 w-5" />
          </button>
        </div>
        <InstallGuide onInstalled={() => (setOpen(false), setShow(false))} />
      </Modal>
    </>
  );
}
