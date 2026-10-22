"use client";

import confetti from "canvas-confetti";

export function celebrate(size: "small" | "big" = "big") {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#8b5cf6", "#14b8a6", "#facc15", "#fb7185", "#22c55e"];
  if (size === "small") {
    confetti({ particleCount: 40, spread: 60, startVelocity: 30, origin: { y: 0.7 }, colors, scalar: 0.8 });
    return;
  }
  const end = Date.now() + 900;
  (function frame() {
    confetti({ particleCount: 6, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors });
    confetti({ particleCount: 6, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}
