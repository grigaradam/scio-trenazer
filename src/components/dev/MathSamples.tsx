"use client";

import { RichText } from "../RichText";
import { MATH_SAMPLES } from "./mathCorpus";

// Visual QA of math formatting: each sample as body text and as an answer option (inline RichText).
export function MathSamples() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-6">
      <h1 className="font-display text-2xl font-extrabold">Matematika – vizuální kontrola</h1>
      {MATH_SAMPLES.map((s) => (
        <section key={s.title} className="space-y-3">
          <h2 className="font-display text-xl font-bold">{s.title}</h2>
          {s.items.map((src, i) => (
            <div key={i} data-sample={`${s.title}#${i}`} className="grid gap-2 rounded-2xl border-2 border-border bg-surface p-3 sm:grid-cols-[1fr_14rem]">
              <RichText className="min-w-0 text-[16px]">{src}</RichText>
              <div className="flex min-w-0 items-start gap-2 rounded-xl border-2 border-border p-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-sm font-bold">A</span>
                <RichText className="min-w-0 flex-1 pt-0.5" inline>
                  {src}
                </RichText>
              </div>
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
