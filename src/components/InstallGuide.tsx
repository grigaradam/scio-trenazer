"use client";

import { Check, Copy, Ellipsis, Plus, Share, SquarePlus } from "lucide-react";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { canPromptInstall, installPlatform, promptInstall, subscribeInstall, type InstallPlatform } from "@/lib/install";
import { AppIcon } from "@/lib/appIcon";
import { Button } from "./ui";

const usePlatform = () => useSyncExternalStore(subscribeInstall, installPlatform, () => "desktop" as InstallPlatform);
export const useCanPrompt = () => useSyncExternalStore(subscribeInstall, canPromptInstall, () => false);

function Step({ n, children, art }: { n: number; children: ReactNode; art?: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-extrabold text-white">{n}</span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="text-[15px] leading-snug">{children}</div>
        {art && <div className="mt-2">{art}</div>}
      </div>
    </li>
  );
}

/** Small mock of a menu row, so people recognise what to look for in Safari. */
function MenuRow({ icon, label, highlight }: { icon: ReactNode; label: string; highlight?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold ${highlight ? "bg-brand-50 text-brand-700 ring-2 ring-brand-500 dark:bg-brand-900/30 dark:text-brand-200" : "bg-surface-2 text-muted"}`}
    >
      {label}
      {icon}
    </div>
  );
}

function SafariBar() {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-surface-2 p-2">
      <div className="flex-1 truncate rounded-xl bg-surface px-3 py-1.5 text-xs text-muted">nanecisto.fun</div>
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-white ring-4 ring-brand-500/25">
        <Share className="h-4 w-4" />
      </span>
      <span className="flex h-8 w-8 items-center justify-center rounded-full text-muted">
        <Ellipsis className="h-4 w-4" />
      </span>
    </div>
  );
}

function HomeIcon() {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
      <div className="h-12 w-12 overflow-hidden rounded-[22%] shadow-md">
        <AppIcon size={48} />
      </div>
      <div className="text-sm text-muted">
        Tahle ikonka se objeví na ploše. <b className="text-text">Otevírej Nanečisto přes ni.</b>
      </div>
    </div>
  );
}

function CopyLink() {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={async () => {
        await navigator.clipboard.writeText(location.origin + "/app").catch(() => {});
        setCopied(true);
      }}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? "Zkopírováno" : "Zkopírovat odkaz"}
    </Button>
  );
}

/**
 * Step-by-step "add to home screen" for the current device. Where the browser allows it (Chrome on Android
 * and desktop) it is a single button; on iOS it shows Safari's menu with the right items highlighted.
 */
export function InstallGuide({ onInstalled }: { onInstalled?: () => void }) {
  const platform = usePlatform();
  const canPrompt = useCanPrompt();
  const [busy, setBusy] = useState(false);

  if (platform === "standalone") {
    return <p className="text-[15px]">✅ Nanečisto už máš na ploše a právě ho používáš.</p>;
  }

  if (canPrompt) {
    return (
      <div className="space-y-3">
        <p className="text-[15px] text-muted">Stačí jedno klepnutí a Nanečisto budeš mít na ploše jako appku.</p>
        <Button
          className="w-full"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await promptInstall();
            setBusy(false);
            if (ok) onInstalled?.();
          }}
        >
          <Plus className="h-5 w-5" />
          Přidat na plochu
        </Button>
      </div>
    );
  }

  if (platform === "in-app") {
    return (
      <ol className="space-y-4">
        <Step n={1}>
          Teď jsi v prohlížeči uvnitř jiné aplikace (Instagram, Messenger…) a odtud to nejde. Otevři stránku v{" "}
          <b>{/Android/.test(navigator.userAgent) ? "Chromu" : "Safari"}</b>: klepni na <Ellipsis className="inline h-4 w-4 align-[-3px]" /> a
          vyber <b>Otevřít v prohlížeči</b>.
        </Step>
        <Step n={2} art={<CopyLink />}>
          Nebo zkopíruj odkaz a vlož ho do prohlížeče ručně.
        </Step>
        <Step n={3}>Pak se sem vrať – návod se ukáže znovu.</Step>
      </ol>
    );
  }

  if (platform === "ios-safari" || platform === "ios-other") {
    const chrome = platform === "ios-other";
    return (
      <ol className="space-y-4">
        <Step n={1} art={chrome ? undefined : <SafariBar />}>
          {chrome ? (
            <>
              Klepni na <Share className="inline h-4 w-4 align-[-3px]" /> <b>Sdílet</b> vpravo v adresním řádku.
            </>
          ) : (
            <>
              Dole v Safari klepni na <Share className="inline h-4 w-4 align-[-3px]" /> <b>Sdílet</b>. Nevidíš ho? Je schovaný pod{" "}
              <Ellipsis className="inline h-4 w-4 align-[-3px]" /> vedle adresy.
            </>
          )}
        </Step>
        <Step
          n={2}
          art={
            <div className="space-y-1.5">
              <MenuRow label="Přidat do oblíbených" icon={<span className="text-xs">☆</span>} />
              <MenuRow label="Přidat na plochu" icon={<SquarePlus className="h-4 w-4" />} highlight />
            </div>
          }
        >
          Sjeď v nabídce níž a vyber <b>Přidat na plochu</b>. Když tam není, klepni nejdřív na <b>Zobrazit víc</b>.
        </Step>
        <Step n={3}>
          Klepni vpravo nahoře na <b>Přidat</b>. (Pokud tam je přepínač <b>Otevřít jako webovou aplikaci</b>, nech ho zapnutý.)
        </Step>
        <Step n={4} art={<HomeIcon />}>
          Najdi ikonku na ploše a otevři ji. Pak se jen znovu přihlas a můžeš zapnout připomínky.
        </Step>
      </ol>
    );
  }

  if (platform === "android") {
    return (
      <ol className="space-y-4">
        <Step n={1}>
          V Chromu klepni vpravo nahoře na <Ellipsis className="inline h-4 w-4 rotate-90 align-[-3px]" /> <b>menu</b>.
        </Step>
        <Step n={2} art={<MenuRow label="Přidat na plochu" icon={<SquarePlus className="h-4 w-4" />} highlight />}>
          Vyber <b>Přidat na plochu</b> (nebo <b>Instalovat aplikaci</b>) a potvrď.
        </Step>
        <Step n={3} art={<HomeIcon />}>
          Otevři Nanečisto z plochy.
        </Step>
      </ol>
    );
  }

  return (
    <p className="text-[15px] text-muted">
      Na počítači klepni v adresním řádku na ikonku <b>Instalovat</b> (Chrome, Edge), v Safari na Macu použij <b>Soubor → Přidat do Docku</b>. Na
      telefonu otevři nanecisto.fun a ukáže se ti návod.
    </p>
  );
}
