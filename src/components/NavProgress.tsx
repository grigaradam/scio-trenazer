"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const START_EVENT = "nav-progress:start";

/** Call before router.push()/replace() so the top bar shows immediately. */
export function startNavProgress() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(START_EVENT));
}

/**
 * Thin animated bar at the top of the page during every navigation:
 * starts on link click (or startNavProgress()), finishes when the URL changes.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const start = () => {
      if (timer.current) clearTimeout(timer.current);
      setState("loading");
      // safety: never spin forever
      timer.current = setTimeout(() => setState("idle"), 20000);
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      start();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener(START_EVENT, start);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(START_EVENT, start);
    };
  }, []);

  // URL changed → navigation finished
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((s) => (s === "loading" ? "done" : s));
    const t = setTimeout(() => setState((s) => (s === "done" ? "idle" : s)), 400);
    return () => clearTimeout(t);
  }, [pathname, search]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]"
      style={{ opacity: state === "idle" ? 0 : 1, transition: "opacity 300ms" }}
    >
      <div
        key={state}
        className="h-full rounded-r-full bg-gradient-to-r from-brand-500 via-fuchsia-500 to-analytic-500 shadow-[0_0_10px_var(--color-brand-500)]"
        style={
          state === "loading"
            ? { animation: "nav-load 8s cubic-bezier(0.1, 0.7, 0.2, 1) forwards" }
            : { width: state === "done" ? "100%" : "0%", transition: state === "done" ? "width 200ms ease-out" : "none" }
        }
      />
    </div>
  );
}
