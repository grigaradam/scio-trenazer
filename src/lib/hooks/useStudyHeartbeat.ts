"use client";

import { useEffect, useRef } from "react";
import { emitLiveStats } from "@/lib/liveStats";

/** Counts seconds while `active` and the tab is visible; flushes them to /api/activity every minute and on hide. */
export function useStudyHeartbeat(active: boolean) {
  const pending = useRef(0);

  useEffect(() => {
    const flush = (keepalive = false) => {
      const seconds = Math.min(180, Math.round(pending.current));
      if (seconds < 1) return;
      pending.current -= seconds;
      fetch("/api/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seconds }),
        keepalive,
      }).catch(() => {
        pending.current += seconds;
      });
    };
    const tick = setInterval(() => {
      if (active && document.visibilityState === "visible") {
        pending.current += 1;
        emitLiveStats({ type: "tick", seconds: 1 });
      }
    }, 1000);
    const send = setInterval(() => flush(), 60000);
    const onHide = () => document.visibilityState === "hidden" && flush(true);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(tick);
      clearInterval(send);
      document.removeEventListener("visibilitychange", onHide);
      flush(true);
    };
  }, [active]);
}
