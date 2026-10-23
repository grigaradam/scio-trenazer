"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { readThemePref, setThemePref, subscribeTheme, type ThemePref } from "@/lib/theme";
import { Card } from "./ui";

const OPTIONS: { value: ThemePref; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Světlý", Icon: Sun },
  { value: "dark", label: "Tmavý", Icon: Moon },
  { value: "system", label: "Dle systému", Icon: Monitor },
];

export function ThemePicker() {
  const pref = useSyncExternalStore(subscribeTheme, readThemePref, () => "system" as const);
  return (
    <Card>
      <div className="font-display font-extrabold">Vzhled</div>
      <div role="radiogroup" aria-label="Barevný režim" className="mt-2 grid grid-cols-3 gap-2">
        {OPTIONS.map(({ value, label, Icon }) => (
          <button
            type="button"
            role="radio"
            aria-checked={pref === value}
            key={value}
            onClick={() => setThemePref(value)}
            className={`flex flex-col items-center gap-1 rounded-2xl border-2 py-2.5 text-sm font-bold sm:flex-row sm:justify-center sm:gap-2 ${pref === value ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200" : "border-border"}`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
    </Card>
  );
}
