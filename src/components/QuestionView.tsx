"use client";

import clsx from "clsx";
import { Check, X } from "lucide-react";
import { useState } from "react";
import type { PublicGroup, PublicQuestion } from "@/lib/content/public";
import { normalizeTyped } from "@/lib/scoring";
import { ChartView } from "./ChartView";
import { RichText } from "./RichText";
import { ZoomableImage } from "./ZoomableImage";

export type Tone = "verbal" | "analytic";

/** Content language of a task type (AJ tasks are English, the app is Czech). */
export const langOf = (taskType?: string) => (taskType?.startsWith("aj_") ? "en" : undefined);

export interface Reveal {
  /** Option key per part, or the expected word of a typed part. */
  answer: string[];
  /** Other accepted spellings of typed parts (per part). */
  accepted?: string[][];
}

/** Shared passage / figure / instruction block of a group. */
export function GroupContext({
  group,
  tone,
  compact,
  showInstruction = true,
}: {
  group: PublicGroup;
  tone: Tone;
  compact?: boolean;
  showInstruction?: boolean;
}) {
  const [open, setOpen] = useState(!compact);
  const [full, setFull] = useState(false);
  const long = (group.instruction?.length ?? 0) > 180;
  return (
    <div className="space-y-3" lang={langOf(group.taskType)}>
      {showInstruction && group.instruction && (
        <div
          className={clsx(
            "rounded-2xl px-4 py-3 text-[14px] leading-relaxed",
            tone === "verbal" ? "bg-verbal-50 dark:bg-verbal-700/15" : "bg-analytic-50 dark:bg-analytic-700/15",
          )}
        >
          {compact ? (
            <button className="w-full text-left font-semibold text-muted" onClick={() => setOpen(!open)}>
              {open ? "▾" : "▸"} Instrukce
            </button>
          ) : null}
          {open && (
            <>
              <RichText className={clsx(compact && "mt-1", long && !full && "max-sm:line-clamp-3")}>{group.instruction}</RichText>
              {long && (
                <button onClick={() => setFull(!full)} className="mt-1 text-xs font-bold text-brand-600 sm:hidden dark:text-brand-300">
                  {full ? "Skrýt" : "Zobrazit celou instrukci"}
                </button>
              )}
            </>
          )}
        </div>
      )}
      {(group.passage || group.figure || group.chart) && (
        <div className="rounded-2xl border-2 border-border bg-surface p-4">
          {group.passageTitle && (
            <RichText className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted" inline>
              {group.passageTitle}
            </RichText>
          )}
          {group.passage && (
            <RichText className="text-[15px]" quoteSource>
              {group.passage}
            </RichText>
          )}
          {group.chart && (
            <div className={group.passage ? "mt-3" : ""}>
              <ChartView chart={group.chart} />
            </div>
          )}
          {group.figure && (
            <div className="mt-3">
              <ZoomableImage src={group.figure} alt="Graf / obrázek k úlohám" className="mx-auto max-h-[480px] w-auto max-w-full rounded-lg bg-white p-1" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function QuestionBody({
  question,
  tone,
  selected,
  onSelect,
  reveal,
  disabled,
  wrongShake,
  lang,
}: {
  question: PublicQuestion;
  /** "en" for English tasks – hyphenation and spellcheck follow the content language. */
  lang?: string;
  tone: Tone;
  selected: (string | null)[];
  onSelect?: (part: number, key: string | null) => void;
  reveal?: Reveal | null;
  disabled?: boolean;
  wrongShake?: boolean;
}) {
  return (
    <div className="space-y-4" lang={lang}>
      {question.stem && (
        <RichText className="text-[16px] font-medium" quoteSource>
          {question.stem}
        </RichText>
      )}
      {question.compare && (
        <div className="grid grid-cols-2 overflow-hidden rounded-2xl border-2 border-border">
          <div className="border-r-2 border-border p-3 text-center">
            <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-muted">vlevo</div>
            <RichText>{question.compare.left}</RichText>
          </div>
          <div className="p-3 text-center">
            <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-muted">vpravo</div>
            <RichText>{question.compare.right}</RichText>
          </div>
        </div>
      )}
      {question.figure && (
        <ZoomableImage src={question.figure} alt="Obrázek k úloze" className="mx-auto max-h-[420px] w-auto max-w-full rounded-lg bg-white p-1" />
      )}
      {question.parts.map((part, pi) =>
        part.kind === "text" ? (
          <TypedAnswer
            key={pi}
            tone={tone}
            value={selected[pi] ?? ""}
            onChange={onSelect && !disabled ? (v) => onSelect(pi, v.trim() ? v : null) : undefined}
            expected={reveal ? [reveal.answer[pi], ...(reveal.accepted?.[pi] ?? [])] : null}
            shake={wrongShake}
          />
        ) : (
        <div key={pi} className={clsx(wrongShake && "animate-shake")}>
          {part.label && (
            <div
              className={clsx(
                "mb-2 text-xs font-extrabold uppercase tracking-wider",
                part.label === "synonymum" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
              )}
            >
              {part.label === "synonymum" ? "≈ synonymum" : "≠ antonymum"}
            </div>
          )}
          <div
            className={clsx(
              "grid gap-2",
              part.options.every((o) => o.text.length <= 12 && !o.text.includes("$")) ? "grid-cols-2" : part.options.every((o) => o.text.length < 40) && "sm:grid-cols-2",
            )}
          >
            {part.options.map((o) => {
              const isSel = selected[pi] === o.key;
              const isAns = reveal?.answer[pi] === o.key;
              const state = reveal ? (isAns ? "correct" : isSel ? "wrong" : "idle") : isSel ? "selected" : "idle";
              return (
                <button
                  key={o.key}
                  type="button"
                  disabled={disabled || !onSelect}
                  onClick={() => onSelect?.(pi, isSel ? null : o.key)}
                  className={clsx(
                    "group flex w-full items-start gap-3 rounded-2xl border-2 px-3.5 py-3 text-left text-[15px] transition-all",
                    "disabled:cursor-default",
                    state === "idle" && "border-border bg-surface shadow-[0_3px_0_0_var(--border)] hover:bg-surface-2 active:translate-y-[2px] active:shadow-none",
                    state === "selected" &&
                      (tone === "verbal"
                        ? "border-verbal-500 bg-verbal-50 shadow-[0_3px_0_0_var(--color-verbal-500)] dark:bg-verbal-700/25"
                        : "border-analytic-500 bg-analytic-50 shadow-[0_3px_0_0_var(--color-analytic-500)] dark:bg-analytic-700/25"),
                    state === "correct" && "border-emerald-500 bg-emerald-50 shadow-[0_3px_0_0_#10b981] dark:bg-emerald-900/30",
                    state === "wrong" && "border-rose-400 bg-rose-50 shadow-[0_3px_0_0_#fb7185] dark:bg-rose-900/30",
                  )}
                >
                  <span
                    className={clsx(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 text-sm font-extrabold",
                      state === "idle" && "border-border text-muted",
                      state === "selected" && (tone === "verbal" ? "border-verbal-500 bg-verbal-500 text-white" : "border-analytic-500 bg-analytic-500 text-white"),
                      state === "correct" && "border-emerald-500 bg-emerald-500 text-white",
                      state === "wrong" && "border-rose-400 bg-rose-400 text-white",
                    )}
                  >
                    {state === "correct" ? <Check className="h-4 w-4" strokeWidth={3} /> : state === "wrong" ? <X className="h-4 w-4" strokeWidth={3} /> : o.key}
                  </span>
                  <RichText className="min-w-0 flex-1 pt-0.5" inline>
                    {o.text}
                  </RichText>
                </button>
              );
            })}
          </div>
        </div>
        ),
      )}
    </div>
  );
}

/** Typed one-word answer (AJ word formation). */
function TypedAnswer({
  tone,
  value,
  onChange,
  expected,
  shake,
}: {
  tone: Tone;
  value: string;
  onChange?: (v: string) => void;
  /** Accepted answers once revealed (first = the main one). */
  expected: string[] | null;
  shake?: boolean;
}) {
  const ok = expected ? expected.some((e) => e && normalizeTyped(e) === normalizeTyped(value)) : null;
  return (
    <div className={clsx(shake && "animate-shake")}>
      <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-muted">Tvoje odpověď (jedno slovo)</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value.toUpperCase())}
        readOnly={!onChange}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={40}
        placeholder="NAPIŠ SLOVO"
        className={clsx(
          "w-full rounded-2xl border-2 bg-surface px-4 py-3 font-mono text-lg font-bold uppercase tracking-wider outline-none transition",
          ok === null &&
            (tone === "verbal" ? "border-border focus:border-verbal-500" : "border-border focus:border-analytic-500"),
          ok === true && "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30",
          ok === false && "border-rose-400 bg-rose-50 dark:bg-rose-900/30",
        )}
      />
      {expected && !ok && (
        <div className="mt-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
          Správně: {expected.filter(Boolean).join(" / ")}
        </div>
      )}
    </div>
  );
}
