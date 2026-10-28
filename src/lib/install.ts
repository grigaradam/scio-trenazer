"use client";

// Add-to-home-screen helpers. Chromium (Android, desktop) can install with one tap through the
// beforeinstallprompt event; iOS has no such API, so there we can only walk the user through Safari's menu.

export type InstallPlatform =
  | "standalone" // already running from the home screen
  | "ios-safari"
  | "ios-other" // Chrome/Firefox/Edge on iOS – also have "Přidat na plochu" in their share menu
  | "in-app" // Instagram, Messenger, TikTok… webviews can't install anything
  | "android"
  | "desktop";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep Chrome's own mini-infobar away; we show our button instead
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

export function subscribeInstall(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** True when the browser offered a one-tap install (Chromium only). */
export const canPromptInstall = () => deferred !== null;

/** Shows the browser's install dialog. Resolves true when the user accepted. */
export async function promptInstall() {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  emit();
  await e.prompt();
  return (await e.userChoice).outcome === "accepted";
}

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function installPlatform(): InstallPlatform {
  if (isStandalone()) return "standalone";
  const ua = navigator.userAgent;
  if (/FBAN|FBAV|FB_IAB|Instagram|Messenger|TikTok|musical_ly|Snapchat|Line\/|LinkedInApp|GSA\//.test(ua)) return "in-app";
  if (isIOS()) return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? "ios-other" : "ios-safari";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}
