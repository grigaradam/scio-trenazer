"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Counts one page view per navigation (admin traffic stats). */
export function PageTracker() {
  const path = usePathname();
  useEffect(() => {
    fetch("/api/track", { method: "POST", keepalive: true }).catch(() => {});
  }, [path]);
  return null;
}
