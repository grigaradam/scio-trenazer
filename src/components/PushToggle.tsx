"use client";

import { Bell, BellOff, Share, SquarePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { VAPID_PUBLIC_KEY } from "@/lib/env";
import { Button, Card } from "./ui";

type State = "loading" | "unsupported" | "install" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string) {
  const raw = atob((base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

async function registration() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

/** Daily-reminder switch in the profile. On iOS, push only exists once the app is added to the home screen. */
export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (isIOS() && !isStandalone()) return setState("install");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const sub = await (await registration()).pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    setNote(null);
    try {
      // must run straight from the tap – iOS refuses permission prompts that aren't user-initiated
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }));
      const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Uložení se nepovedlo");
      setState("on");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Zapnutí se nepovedlo");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setNote(null);
    try {
      const sub = await (await registration()).pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/push/test", { method: "POST" });
    setNote(res.ok ? "Odesláno – za pár vteřin by mělo dorazit." : ((await res.json().catch(() => null))?.error ?? "Odeslání selhalo"));
    setBusy(false);
  }

  if (state === "loading") return null;

  return (
    <Card>
      <div className="flex items-center gap-2 font-display font-extrabold">
        <Bell className="h-4 w-4" />
        Připomínky
      </div>

      {!VAPID_PUBLIC_KEY ? (
        <p className="mt-2 text-sm text-muted">Oznámení zatím nejsou na serveru nastavená.</p>
      ) : state === "install" ? (
        <div className="mt-2 text-sm text-muted">
          <p>Na iPhonu chodí oznámení jen z appky na ploše:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              V Safari klepni na <Share className="inline h-4 w-4 align-[-2px]" /> <b>Sdílet</b>.
            </li>
            <li>
              Vyber <SquarePlus className="inline h-4 w-4 align-[-2px]" /> <b>Přidat na plochu</b>.
            </li>
            <li>Otevři Nanečisto z plochy a tady zapni připomínky.</li>
          </ol>
        </div>
      ) : state === "unsupported" ? (
        <p className="mt-2 text-sm text-muted">Tenhle prohlížeč oznámení nepodporuje. Na iPhonu je potřeba iOS 16.4 nebo novější.</p>
      ) : state === "denied" ? (
        <p className="mt-2 text-sm text-muted">
          Oznámení máš zakázaná. Povol je v Nastavení → Oznámení → Nanečisto (na počítači v nastavení webu v prohlížeči).
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted">
            {state === "on"
              ? "Zapnuto na tomhle zařízení. V 11:00 ti popřeju dobré ráno, v 15:00 a 18:00 připomenu trénink, pokud ještě nemáš odmakáno."
              : "V 11:00 ti popřeju dobré ráno, v 15:00 a 18:00 připomenu trénink, pokud ještě nemáš odmakáno – ať nepřijdeš o sérii."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {state === "on" ? (
              <>
                <Button size="sm" variant="secondary" loading={busy} onClick={test}>
                  Poslat zkušební
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={disable}>
                  <BellOff className="h-4 w-4" />
                  Vypnout
                </Button>
              </>
            ) : (
              <Button size="sm" loading={busy} onClick={enable}>
                <Bell className="h-4 w-4" />
                Zapnout připomínky
              </Button>
            )}
          </div>
        </>
      )}
      {note && <p className="mt-2 text-sm text-muted">{note}</p>}
    </Card>
  );
}
