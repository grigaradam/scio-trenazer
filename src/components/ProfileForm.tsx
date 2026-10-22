"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card } from "./ui";

export function ProfileForm({ name, goal }: { name: string; goal: number }) {
  const router = useRouter();
  const [n, setN] = useState(name);
  const [g, setG] = useState(goal);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  return (
    <Card>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setState("saving");
          await fetch("/api/profile", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ display_name: n, daily_goal_min: g }),
          });
          setState("saved");
          router.refresh();
        }}
      >
        <label className="block">
          <span className="text-sm font-bold">Jméno</span>
          <input
            value={n}
            onChange={(e) => setN(e.target.value)}
            maxLength={40}
            className="mt-1 h-11 w-full rounded-2xl border-2 border-border bg-surface px-3 outline-none focus:border-brand-500"
          />
        </label>
        <div>
          <span className="text-sm font-bold">Denní cíl</span>
          <div className="mt-1 grid grid-cols-4 gap-2">
            {[10, 20, 40, 60].map((m) => (
              <button
                type="button"
                key={m}
                onClick={() => setG(m)}
                className={`rounded-2xl border-2 py-2 font-bold ${g === m ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200" : "border-border"}`}
              >
                {m} min
              </button>
            ))}
          </div>
        </div>
        <div className="text-sm text-muted">Zkouška: OSP (další zkoušky připravujeme)</div>
        <Button type="submit" loading={state === "saving"}>
          {state === "saving" ? "Ukládám…" : state === "saved" ? "Uloženo ✓" : "Uložit"}
        </Button>
      </form>
    </Card>
  );
}
