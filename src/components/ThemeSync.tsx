"use client";

import { useLayoutEffect } from "react";
import { applyTheme, subscribeTheme } from "@/lib/theme";

/** Keeps <html data-theme> right after the dev Strict Mode remount, other-tab changes and system switches. */
export function ThemeSync() {
  useLayoutEffect(() => {
    applyTheme();
    return subscribeTheme(() => applyTheme());
  }, []);
  return null;
}
