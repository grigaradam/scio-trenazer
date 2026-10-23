"use client";

import clsx from "clsx";
import { Check, ChevronDown, Shuffle } from "lucide-react";
import { useEffect, useState } from "react";
import { SECTION_META, taskTypesFor } from "@/lib/content/exams";
import type { SectionId } from "@/lib/content/types";
import { count } from "@/lib/czech";
import { ButtonLink } from "./ui";

const SECTIONS: SectionId[] = ["verbal", "analytic"];
const STORE = "scio:mix-types";

/** Hub card for a mixed practice session: everything at once, or a hand-picked set of sections and task types. */
export function MixPicker({ mistakes }: { mistakes: Record<string, number> }) {
  const all = taskTypesFor("osp");
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>(all.map((t) => t.id));

  // remember the last custom selection on this device
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? "null");
      const valid = Array.isArray(saved) ? saved.filter((id) => all.some((t) => t.id === id)) : [];
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (valid.length) setPicked(valid);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function update(next: string[]) {
    setPicked(next);
    try {
      localStorage.setItem(STORE, JSON.stringify(next));
    } catch {}
  }

  const toggle = (id: string) => update(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  const toggleSection = (s: SectionId) => {
    const ids = taskTypesFor("osp", s).map((t) => t.id as string);
    const full = ids.every((id) => picked.includes(id));
    update(full ? picked.filter((id) => !ids.includes(id)) : [...new Set([...picked, ...ids])]);
  };

  const everything = picked.length === all.length;
  const pickedMistakes = picked.reduce((n, id) => n + (mistakes[id] ?? 0), 0);
  // keep the URL in the hub's type order, so the same selection always gives the same link
  const href = everything
    ? "/app/practice/mix"
    : picked.length === 1
      ? `/app/practice/${picked[0]}`
      : `/app/practice/mix?types=${all.filter((t) => picked.includes(t.id)).map((t) => t.id).join(",")}`;

  return (
    <section className="rounded-3xl border-2 border-border bg-surface p-4 shadow-[0_4px_0_0_var(--border)] sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-3xl">🎲</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-extrabold">Mix</h2>
          <p className="text-sm text-muted">Úlohy na přeskáčku, jako v testu. Trénuj všechno, nebo si vyklikej oddíly a typy.</p>
        </div>
        <ButtonLink href="/app/practice/mix" className="max-sm:w-full">
          <Shuffle className="h-4 w-4" /> Trénovat vše
        </ButtonLink>
      </div>

      <button
        onClick={() => setOpen((o) => !o)}
        className="mt-3 flex items-center gap-1 text-sm font-bold text-muted hover:text-text"
        aria-expanded={open}
      >
        <ChevronDown className={clsx("h-4 w-4 transition", open && "rotate-180")} />
        Vybrat oddíly a typy úloh
      </button>

      {open && (
        <div className="mt-3 animate-fade-up space-y-4">
          {SECTIONS.map((s) => {
            const types = taskTypesFor("osp", s);
            const on = types.filter((t) => picked.includes(t.id)).length;
            const verbal = s === "verbal";
            return (
              <div key={s}>
                <button
                  onClick={() => toggleSection(s)}
                  className={clsx(
                    "mb-2 flex items-center gap-2 font-display font-bold",
                    verbal ? "text-verbal-600" : "text-analytic-600",
                  )}
                >
                  <span
                    className={clsx(
                      "grid h-5 w-5 place-items-center rounded-md border-2",
                      on === types.length
                        ? verbal
                          ? "border-verbal-600 bg-verbal-600 text-white"
                          : "border-analytic-600 bg-analytic-600 text-white"
                        : "border-border",
                    )}
                  >
                    {on === types.length ? <Check className="h-3.5 w-3.5" /> : on > 0 ? <span className="h-0.5 w-2.5 rounded bg-current" /> : null}
                  </span>
                  {SECTION_META[s].title}
                  <span className="text-xs font-bold text-muted">
                    {on}/{types.length}
                  </span>
                </button>
                <div className="flex flex-wrap gap-2">
                  {types.map((t) => {
                    const active = picked.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() => toggle(t.id)}
                        aria-pressed={active}
                        className={clsx(
                          "flex items-center gap-1.5 rounded-xl border-2 px-3 py-1.5 text-sm font-bold transition",
                          active
                            ? verbal
                              ? "border-verbal-500 bg-verbal-50 text-verbal-700 dark:bg-verbal-700/20 dark:text-verbal-100"
                              : "border-analytic-500 bg-analytic-50 text-analytic-700 dark:bg-analytic-700/20 dark:text-analytic-100"
                            : "border-border text-muted hover:text-text",
                        )}
                      >
                        <span>{t.emoji}</span>
                        {t.name}
                        {(mistakes[t.id] ?? 0) > 0 && (
                          <span className="rounded-full bg-amber-100 px-1.5 text-[11px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                            {mistakes[t.id]}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="flex flex-wrap items-center gap-3 border-t-2 border-border pt-3">
            <div className="flex-1 text-sm font-semibold text-muted">
              {picked.length
                ? `${count(picked.length, "typ", "typy", "typů")}${pickedMistakes ? ` · ${count(pickedMistakes, "chyba", "chyby", "chyb")} k opravě` : ""}`
                : "Vyber aspoň jeden typ úloh"}
            </div>
            <button onClick={() => update(everything ? [] : all.map((t) => t.id))} className="text-sm font-bold text-muted hover:text-text">
              {everything ? "Zrušit vše" : "Vybrat vše"}
            </button>
            {picked.length ? (
              <ButtonLink href={href} variant="secondary">
                Spustit výběr
              </ButtonLink>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
