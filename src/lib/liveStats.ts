"use client";

// Tiny event bus so the header stats (daily goal, XP, streak) update live without a page refresh.

export type LiveStatsEvent =
  | { type: "tick"; seconds: number }
  | { type: "answer"; xp: number; streak?: number | null };

const EVENT = "live-stats";

export function emitLiveStats(detail: LiveStatsEvent) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<LiveStatsEvent>(EVENT, { detail }));
}

export function onLiveStats(cb: (e: LiveStatsEvent) => void) {
  const handler = (e: Event) => cb((e as CustomEvent<LiveStatsEvent>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
