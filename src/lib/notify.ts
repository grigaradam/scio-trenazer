"use client";

// Achievement / level-up notices, shown by <Notifications /> in the app shell.

import { emitLiveStats } from "./liveStats";

export type Notice = { kind: "achievement"; code: string } | { kind: "level"; level: number };

const EVENT = "notify";

export function notify(notices: Notice[]) {
  if (typeof window !== "undefined" && notices.length) window.dispatchEvent(new CustomEvent<Notice[]>(EVENT, { detail: notices }));
}

export function onNotify(cb: (notices: Notice[]) => void) {
  const handler = (e: Event) => cb((e as CustomEvent<Notice[]>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

/** Handles the reward fields of an answer/submit response: header XP and the notices. */
export function announceRewards(j: { achievements?: string[]; achievementXp?: number; levelUp?: number | null }) {
  if (j.achievementXp) emitLiveStats({ type: "answer", xp: j.achievementXp });
  notify([
    ...(j.achievements ?? []).map((code): Notice => ({ kind: "achievement", code })),
    ...(j.levelUp ? [{ kind: "level", level: j.levelUp } as Notice] : []),
  ]);
}
