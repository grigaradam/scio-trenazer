"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EXAMS } from "@/lib/content/exams";
import { Logo } from "./Logo";
import { startNavProgress } from "./NavProgress";
import { Button } from "./ui";

const GOALS = [
  { min: 10, label: "Pohodově", emoji: "🐢" },
  { min: 20, label: "Normálně", emoji: "🚶" },
  { min: 40, label: "Vážně", emoji: "🏃" },
  { min: 60, label: "Na plný plyn", emoji: "🚀" },
];

export function Onboarding({ name }: { name: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [exam, setExam] = useState("osp");
  const [goal, setGoal] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish(startTest: boolean) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exam, daily_goal_min: goal, onboarded: true }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Chyba");
      if (startTest) {
        const a = await fetch("/api/attempts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ diagnostic: true }),
        });
        const data = await a.json();
        if (!a.ok) throw new Error(data.error ?? "Chyba");
        startNavProgress();
        router.push(`/app/test/${data.id}`);
      } else {
        startNavProgress();
        router.push("/app");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <Logo small />
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className={clsx("h-2.5 w-8 rounded-full transition", i <= step ? "bg-brand-500" : "bg-surface-2")} />
          ))}
        </div>
      </div>

      {step === 0 && (
        <section className="animate-fade-up">
          <h1 className="font-display text-3xl font-extrabold">Ahoj{name ? `, ${name}` : ""}! 👋</h1>
          <p className="mt-2 text-muted">Na jakou zkoušku se připravuješ?</p>
          <div className="mt-6 grid gap-3">
            {EXAMS.map((e) => (
              <button
                key={e.id}
                disabled={!e.enabled}
                onClick={() => setExam(e.id)}
                className={clsx(
                  "flex items-center gap-4 rounded-3xl border-2 p-4 text-left transition",
                  !e.enabled && "cursor-not-allowed opacity-50",
                  exam === e.id ? "border-brand-500 bg-brand-50 shadow-[0_4px_0_0_var(--color-brand-300)] dark:bg-brand-900/30" : "border-border bg-surface hover:bg-surface-2",
                )}
              >
                <span className="text-3xl">{e.emoji}</span>
                <span className="flex-1">
                  <span className="block font-display text-lg font-bold">
                    {e.short} – {e.name}
                  </span>
                  <span className="text-sm text-muted">{e.description}</span>
                </span>
                {!e.enabled && <span className="rounded-full bg-surface-2 px-2 py-1 text-xs font-bold text-muted">Brzy</span>}
              </button>
            ))}
          </div>
          <Button size="lg" className="mt-8 w-full" onClick={() => setStep(1)}>
            Pokračovat
          </Button>
        </section>
      )}

      {step === 1 && (
        <section className="animate-fade-up">
          <h1 className="font-display text-3xl font-extrabold">Denní cíl 🎯</h1>
          <p className="mt-2 text-muted">Kolik minut denně chceš trénovat? Pravidelnost porazí šprtání na poslední chvíli.</p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {GOALS.map((g) => (
              <button
                key={g.min}
                onClick={() => setGoal(g.min)}
                className={clsx(
                  "rounded-3xl border-2 p-4 text-left transition",
                  goal === g.min ? "border-brand-500 bg-brand-50 shadow-[0_4px_0_0_var(--color-brand-300)] dark:bg-brand-900/30" : "border-border bg-surface hover:bg-surface-2",
                )}
              >
                <div className="text-2xl">{g.emoji}</div>
                <div className="mt-1 font-display text-lg font-bold">{g.min} min</div>
                <div className="text-sm text-muted">{g.label}</div>
              </button>
            ))}
          </div>
          <div className="mt-8 flex gap-3">
            <Button variant="secondary" size="lg" onClick={() => setStep(0)}>
              Zpět
            </Button>
            <Button size="lg" className="flex-1" onClick={() => setStep(2)}>
              Pokračovat
            </Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="animate-fade-up">
          <h1 className="font-display text-3xl font-extrabold">Úvodní test 📝</h1>
          <p className="mt-2 text-muted">
            Začneme celým testem OSP z minulých let – přesně jako na ostro. Zjistíme, kde jsi teď, a podle toho ti
            připravíme trénink.
          </p>
          <ul className="mt-6 space-y-3">
            {[
              ["📖", "Verbální oddíl", "33 úloh · 35 minut"],
              ["🧮", "Analytický oddíl", "33 úloh · 50 minut, bez kalkulačky – počítej na papír"],
              ["⚖️", "Bodování jako Scio", "správně +1, špatně −⅓, nevyplněno 0 → hádej jen s rozumem"],
              ["⏸️", "Pauza", "test jde pozastavit a dokončit později, ale ostrý režim je nejlepší trénink"],
            ].map(([e, t, d]) => (
              <li key={t} className="flex gap-3 rounded-2xl border-2 border-border bg-surface p-3">
                <span className="text-2xl">{e}</span>
                <span>
                  <span className="block font-bold">{t}</span>
                  <span className="text-sm text-muted">{d}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted">Připrav si papír, tužku a 90 minut klidu. 💪</p>
          {error && <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
          <div className="mt-8 flex flex-col gap-3">
            <Button size="lg" onClick={() => finish(true)} loading={busy}>
              {busy ? "Připravuji…" : "Spustit úvodní test"}
            </Button>
            <Button variant="ghost" onClick={() => finish(false)} disabled={busy}>
              Teď ne, nejdřív se rozkoukám
            </Button>
          </div>
        </section>
      )}
    </main>
  );
}
