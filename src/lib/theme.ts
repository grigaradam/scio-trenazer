// Light / dark / system theme. The resolved theme lives in <html data-theme>, the choice in localStorage.

export type ThemePref = "light" | "dark" | "system";

export const THEME_KEY = "theme";
const THEME_EVENT = "themechange";
const DARK_QUERY = "(prefers-color-scheme: dark)";
// keep in sync with viewport.themeColor in app/layout.tsx
const THEME_COLOR = { light: "#f7f6fb", dark: "#0f0d17" };

/** Runs in <head> before first paint, so there is no flash of the wrong theme. */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_KEY}");var d=p==="dark"||(p!=="light"&&matchMedia("${DARK_QUERY}").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light")}catch(e){}})()`;

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(pref: ThemePref = readThemePref()) {
  const theme = pref === "dark" || (pref === "system" && matchMedia(DARK_QUERY).matches) ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  // browser chrome (status bar on phones) follows the chosen theme, not just the system one
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", THEME_COLOR[theme]));
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {}
  applyTheme(pref);
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** For useSyncExternalStore: fires on change in this tab, another tab, or the system setting. */
export function subscribeTheme(cb: () => void) {
  const mq = matchMedia(DARK_QUERY);
  window.addEventListener(THEME_EVENT, cb);
  window.addEventListener("storage", cb);
  mq.addEventListener("change", cb);
  return () => {
    window.removeEventListener(THEME_EVENT, cb);
    window.removeEventListener("storage", cb);
    mq.removeEventListener("change", cb);
  };
}
