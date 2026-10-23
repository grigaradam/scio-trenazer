"use client";

import clsx from "clsx";
import { Lightbulb, Sparkles, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { OptionKey } from "@/lib/content/types";
import { findQuote, scrollToRange, setActiveQuote, setUnderlined } from "@/lib/quotes";
import { RichText, type QuoteEvent } from "./RichText";

export interface ExplanationData {
  verdict: string;
  steps: { title: string; body: string }[];
  options: { key: string; correct: boolean; why: string }[];
  trap: string;
  tip: string;
}

/**
 * [[Quotes]] in the explanation are underlined in the task text (passage/stem of the enclosing
 * data-task-scope); hovering a quote marks its place there, clicking scrolls to it.
 */
function useQuotes(rootRef: React.RefObject<HTMLDivElement | null>, deps: unknown[]) {
  const owner = useId();
  const pinned = useRef<ReturnType<typeof setTimeout>>(undefined);
  const scope = useCallback(() => rootRef.current?.closest("[data-task-scope]") ?? document, [rootRef]);

  useEffect(() => {
    const cites = [...(rootRef.current?.querySelectorAll("cite") ?? [])];
    const ranges = cites.flatMap((c) => {
      const r = findQuote(scope(), c.textContent ?? "");
      c.toggleAttribute("data-missing", !r); // AI misquoted – keep the underline, drop the link
      return r ? [r] : [];
    });
    setUnderlined(owner, ranges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(
    () => () => {
      setUnderlined(owner, []);
      setActiveQuote(null);
      clearTimeout(pinned.current);
    },
    [owner],
  );

  return useCallback(
    (quote: string, event: QuoteEvent) => {
      if (event === "leave") {
        if (!pinned.current) setActiveQuote(null);
        return;
      }
      const range = findQuote(scope(), quote);
      setActiveQuote(range);
      if (event === "click" && range) {
        scrollToRange(range);
        clearTimeout(pinned.current);
        pinned.current = setTimeout(() => {
          pinned.current = undefined;
          setActiveQuote(null);
        }, 2500);
      }
    },
    [scope],
  );
}

/** Fetches (cached) AI explanation and reveals it step by step. */
export function Explanation({ taskRef, given }: { taskRef: string; given?: (OptionKey | null)[] }) {
  const [data, setData] = useState<ExplanationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(1);
  const rootRef = useRef<HTMLDivElement>(null);
  const onQuote = useQuotes(rootRef, [data, shown]);

  useEffect(() => {
    let alive = true;
    fetch("/api/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: taskRef }) })
      .then(async (r) => {
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) setError(j.error ?? "Vysvětlení se nepodařilo načíst.");
        else setData(j.explanation);
      })
      .catch(() => alive && setError("Vysvětlení se nepodařilo načíst."));
    return () => {
      alive = false;
    };
  }, [taskRef]);

  if (error) return <p className="rounded-2xl bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{error}</p>;
  if (!data)
    return (
      <div className="space-y-2 rounded-3xl border-2 border-border bg-surface p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-brand-600">
          <Sparkles className="h-4 w-4 animate-pulse" /> AI lektor připravuje vysvětlení…
        </div>
        {[80, 95, 60].map((w) => (
          <div key={w} className="h-3 animate-pulse rounded-full bg-surface-2" style={{ width: `${w}%` }} />
        ))}
      </div>
    );

  const givenKeys = (given ?? []).filter(Boolean) as string[];
  const allShown = shown >= data.steps.length;
  return (
    <div ref={rootRef} className="explain space-y-3 rounded-3xl border-2 border-brand-200 bg-gradient-to-b from-brand-50 to-surface p-4 dark:border-brand-800 dark:from-brand-900/20 sm:p-5">
      <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-brand-600 dark:text-brand-300">
        <Sparkles className="h-4 w-4" /> Vysvětlení
      </div>
      <RichText className="text-[16px] font-semibold" onQuote={onQuote}>
        {data.verdict}
      </RichText>

      <ol className="space-y-3">
        {data.steps.slice(0, shown).map((s, i) => (
          <li key={i} className="flex animate-fade-up gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-extrabold text-white">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="font-bold">{s.title}</div>
              <RichText className="text-[15px]" onQuote={onQuote}>
                {s.body}
              </RichText>
            </div>
          </li>
        ))}
      </ol>
      {!allShown && (
        <button
          onClick={() => setShown((n) => n + 1)}
          className="w-full rounded-2xl border-2 border-dashed border-brand-300 py-2.5 text-sm font-bold text-brand-700 transition hover:bg-brand-50 dark:border-brand-700 dark:text-brand-300 dark:hover:bg-brand-900/30"
        >
          Další krok ({shown}/{data.steps.length}) →
        </button>
      )}

      {allShown && (
        <div className="animate-fade-up space-y-3">
          <div className="grid gap-1.5">
            {data.options.map((o) => (
              <div
                key={o.key}
                className={clsx(
                  "flex gap-2 rounded-xl px-3 py-2 text-sm",
                  o.correct ? "bg-emerald-50 dark:bg-emerald-900/25" : givenKeys.includes(o.key) ? "bg-rose-50 dark:bg-rose-900/25" : "bg-surface-2",
                )}
              >
                <span className={clsx("font-extrabold", o.correct ? "text-emerald-600" : "text-muted")}>{o.key}</span>
                <RichText className="min-w-0 flex-1" inline onQuote={onQuote}>
                  {o.why}
                </RichText>
                {givenKeys.includes(o.key) && !o.correct && <span className="shrink-0 text-xs font-bold text-rose-500">tvoje</span>}
              </div>
            ))}
          </div>
          <div className="flex gap-2 rounded-2xl bg-amber-50 p-3 text-sm dark:bg-amber-900/20">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <RichText onQuote={onQuote}>{`**Past:** ${data.trap}`}</RichText>
          </div>
          <div className="flex gap-2 rounded-2xl bg-sky-50 p-3 text-sm dark:bg-sky-900/20">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
            <RichText>{`**Tip:** ${data.tip}`}</RichText>
          </div>
        </div>
      )}
    </div>
  );
}
