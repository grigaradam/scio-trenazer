"use client";

// Answer sound effects, synthesized with Web Audio so there are no files to load.

const KEY = "nanecisto:sound";
let ctx: AudioContext | null = null;
const listeners = new Set<() => void>();

export function subscribeSound(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function soundEnabled() {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
  listeners.forEach((fn) => fn());
}

function audio() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

// Call synchronously inside the click/keydown handler, before any await:
// iOS Safari only lets audio start from a user gesture.
export function primeSounds() {
  const c = audio();
  if (c?.state === "suspended") c.resume().catch(() => {});
}

function tone(c: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(vol, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

export function playSound(kind: "correct" | "wrong") {
  if (!soundEnabled()) return;
  const c = audio();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  const t = c.currentTime + 0.01;
  if (kind === "correct") {
    // bright rising two-note "ding-ding"
    tone(c, 880, t, 0.14, "sine", 0.25);
    tone(c, 1760, t, 0.14, "triangle", 0.06);
    tone(c, 1318.5, t + 0.1, 0.32, "sine", 0.28);
    tone(c, 2637, t + 0.1, 0.32, "triangle", 0.06);
  } else {
    // low, soft descending "bwomp"
    tone(c, 311, t, 0.16, "square", 0.07, 280);
    tone(c, 233, t + 0.13, 0.3, "square", 0.08, 185);
  }
}
