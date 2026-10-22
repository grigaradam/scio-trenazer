"use client";

import clsx from "clsx";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Clock, Dumbbell, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { achievementDef } from "@/lib/gamification";
import { SECTION_META, taskTypeMeta } from "@/lib/content/exams";
import type { PublicGroup, PublicTest } from "@/lib/content/public";
import { testRef } from "@/lib/content/public";
import type { SectionId, TaskType } from "@/lib/content/types";
import { celebrate } from "@/lib/celebrate";
import type { QuestionResult, TestResult } from "@/lib/scoring";
import { ReviewTask } from "./ReviewTask";
import { Badge, ButtonLink, Card, ProgressBar, Ring, SectionTitle } from "./ui";

interface Props {
  attemptId: string;
  test: PublicTest;
  result: TestResult;
  activeSeconds: number;
  pauses: number;
  isNew: boolean;
  xp: number;
  achievements: string[];
  comparison: { previousTitle: string; previousPercent: number; rows: { type: TaskType; now: number | null; before: number | null; delta: number | null }[] } | null;
  isDiagnostic: boolean;
}

const fmtScore = (x: number) => x.toLocaleString("cs-CZ", { maximumFractionDigits: 1 });
const statusColor: Record<QuestionResult["status"], string> = {
  correct: "bg-emerald-500 border-emerald-500 text-white",
  wrong: "bg-rose-500 border-rose-500 text-white",
  partial: "bg-amber-400 border-amber-400 text-white",
  blank: "bg-surface border-border text-muted",
};

export function ResultsView({ test, result, activeSeconds, pauses, isNew, xp, achievements, comparison, isDiagnostic }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const [filter, setFilter] = useState<"missed" | "all">("missed");

  useEffect(() => {
    if (isNew) setTimeout(() => celebrate("big"), 300);
  }, [isNew]);

  const groupOf = useMemo(() => {
    const map = new Map<number, { group: PublicGroup; section: SectionId }>();
    for (const s of test.sections)
      for (const g of s.groups) for (const q of g.questions) map.set(q.n, { group: { ...g, questions: [q] }, section: s.id });
    return map;
  }, [test]);

  const missed = result.questions.filter((q) => q.status !== "correct");
  const list = filter === "missed" ? missed : result.questions;
  const openIdx = open === null ? -1 : list.findIndex((q) => q.n === open);

  const typeRows = (Object.entries(result.types) as [TaskType, NonNullable<TestResult["types"][TaskType]>][])
    .map(([type, b]) => ({ type, b, pct: b.max ? Math.max(0, b.score / b.max) : 0 }))
    .sort((a, b) => a.pct - b.pct);

  return (
    <div className="space-y-8">
      {/* hero */}
      <section className="animate-fade-up">
        <div className="text-sm font-bold uppercase tracking-wider text-muted">
          {isDiagnostic ? "Úvodní test · " : ""}
          {test.title}
        </div>
        <div className="mt-3 grid gap-4 md:grid-cols-[auto_1fr]">
          <Card className="flex items-center gap-5">
            <Ring value={Math.max(0, result.score / result.maxScore)} size={112} stroke={12} color="var(--color-brand-500)">
              <div className="text-center">
                <div className="font-display text-2xl font-extrabold">{result.percent} %</div>
              </div>
            </Ring>
            <div>
              <div className="font-display text-4xl font-extrabold">
                {fmtScore(result.score)}
                <span className="text-xl text-muted"> / {result.maxScore}</span>
              </div>
              <div className="text-sm text-muted">bodů</div>
              {result.percentile !== null && (
                <div className="mt-2">
                  <Badge tone="brand">≈ {result.percentile}. percentil</Badge>
                </div>
              )}
            </div>
          </Card>
          <div className="grid grid-cols-2 gap-4">
            {(["verbal", "analytic"] as SectionId[]).map((s) => {
              const b = result.sections[s];
              return (
                <Card key={s} className={s === "verbal" ? "border-verbal-100 dark:border-verbal-700/40" : "border-analytic-100 dark:border-analytic-700/40"}>
                  <div className={clsx("text-xs font-extrabold uppercase tracking-wider", s === "verbal" ? "text-verbal-600" : "text-analytic-600")}>
                    {SECTION_META[s].title}
                  </div>
                  <div className="mt-1 font-display text-3xl font-extrabold">
                    {fmtScore(b.score)}
                    <span className="text-base text-muted"> / {b.max}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-bold">
                    <span className="text-emerald-600">✓ {b.correct}</span>
                    <span className="text-rose-500">✗ {b.wrong}</span>
                    {b.partial > 0 && <span className="text-amber-500">½ {b.partial}</span>}
                    <span className="text-muted">○ {b.blank}</span>
                  </div>
                  <ProgressBar
                    value={Math.max(0, b.score / b.max)}
                    className="mt-3 h-2"
                    barClassName={s === "verbal" ? "bg-verbal-500" : "bg-analytic-500"}
                  />
                </Card>
              );
            })}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted">
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" /> aktivní čas {Math.round(activeSeconds / 60)} min
          </span>
          {pauses > 0 && <span>· pauzy: {pauses}×</span>}
          {result.percentile !== null && <span>· percentil je odhad podle statistik tohoto testu</span>}
        </div>
      </section>

      {isNew && (xp > 0 || achievements.length > 0) && (
        <section className="flex flex-wrap gap-3">
          {xp > 0 && (
            <div className="animate-pop rounded-2xl bg-brand-600 px-4 py-3 font-display text-lg font-extrabold text-white shadow-[0_4px_0_0_var(--color-brand-800)]">
              +{xp} XP
            </div>
          )}
          {achievements.map((code, i) => {
            const a = achievementDef(code);
            return a ? (
              <div
                key={code}
                className="flex animate-pop items-center gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-2 dark:border-amber-700 dark:bg-amber-900/20"
                style={{ animationDelay: `${(i + 1) * 150}ms` }}
              >
                <span className="text-2xl">{a.emoji}</span>
                <div>
                  <div className="text-xs font-bold uppercase text-amber-700 dark:text-amber-300">Nový achievement</div>
                  <div className="font-bold">{a.title}</div>
                </div>
              </div>
            ) : null;
          })}
        </section>
      )}

      {/* comparison */}
      {comparison && (
        <section>
          <SectionTitle>Oproti minulému testu</SectionTitle>
          <Card>
            <p className="mb-3 text-sm text-muted">
              Minule ({comparison.previousTitle}): {comparison.previousPercent} % → teď {result.percent} %{" "}
              {result.percent > comparison.previousPercent ? "📈 zlepšení!" : result.percent < comparison.previousPercent ? "– nevadí, data ukazují, na co se zaměřit." : ""}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {comparison.rows
                .filter((r) => r.delta !== null)
                .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))
                .map((r) => {
                  const meta = taskTypeMeta(r.type)!;
                  const d = Math.round((r.delta ?? 0) * 100);
                  return (
                    <div key={r.type} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                      <span>{meta.emoji}</span>
                      <span className="flex-1 font-semibold">{meta.name}</span>
                      <span
                        className={clsx(
                          "flex items-center gap-0.5 font-extrabold",
                          d > 0 ? "text-emerald-600" : d < 0 ? "text-rose-500" : "text-muted",
                        )}
                      >
                        {d > 0 ? <ArrowUp className="h-4 w-4" /> : d < 0 ? <ArrowDown className="h-4 w-4" /> : "="}
                        {d !== 0 && `${Math.abs(d)} %`}
                      </span>
                    </div>
                  );
                })}
            </div>
          </Card>
        </section>
      )}

      {/* by type */}
      <section>
        <SectionTitle>Úspěšnost podle typu úloh</SectionTitle>
        <div className="grid gap-2">
          {typeRows.map(({ type, b, pct }) => {
            const meta = taskTypeMeta(type)!;
            return (
              <div key={type} className="flex items-center gap-3 rounded-2xl border-2 border-border bg-surface px-3 py-2.5">
                <span className="text-xl">{meta.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-bold">{meta.name}</span>
                    <span className="shrink-0 text-xs font-bold text-muted">
                      {b.correct}/{b.max}
                    </span>
                  </div>
                  <ProgressBar
                    value={pct}
                    className="mt-1 h-2"
                    barClassName={pct >= 0.7 ? "bg-emerald-500" : pct >= 0.4 ? "bg-amber-400" : "bg-rose-500"}
                  />
                </div>
                {b.correct < b.max && (
                  <Link
                    href={`/app/practice/${type}`}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 hover:bg-brand-100 dark:bg-brand-900/30"
                    title="Trénovat tento typ"
                  >
                    <Dumbbell className="h-4 w-4" />
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* questions */}
      <section>
        <SectionTitle
          action={
            <div className="flex rounded-xl bg-surface-2 p-1 text-sm font-bold">
              {(["missed", "all"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={clsx("rounded-lg px-3 py-1", filter === f ? "bg-surface shadow-sm" : "text-muted")}
                >
                  {f === "missed" ? `Chyby (${missed.length})` : "Všechny"}
                </button>
              ))}
            </div>
          }
        >
          Rozbor úloh
        </SectionTitle>
        <p className="mb-3 text-sm text-muted">Klikni na úlohu – nejdřív si ji zkus přepočítat, pak uvidíš řešení a vysvětlení.</p>
        {(["verbal", "analytic"] as SectionId[]).map((s) => (
          <div key={s} className="mb-4">
            <div className={clsx("mb-2 text-xs font-extrabold uppercase tracking-wider", s === "verbal" ? "text-verbal-600" : "text-analytic-600")}>
              {SECTION_META[s].title}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {result.questions
                .filter((q) => q.section === s)
                .map((q) => (
                  <button
                    key={q.n}
                    onClick={() => {
                      if (q.status === "correct" && filter === "missed") setFilter("all");
                      setOpen(q.n);
                    }}
                    className={clsx(
                      "grid h-10 w-10 place-items-center rounded-xl border-2 text-sm font-extrabold transition hover:scale-110",
                      statusColor[q.status],
                    )}
                    title={taskTypeMeta(q.taskType)?.name}
                  >
                    {q.n}
                  </button>
                ))}
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-3 text-xs font-semibold text-muted">
          <span className="flex items-center gap-1"><i className="h-3 w-3 rounded bg-emerald-500" /> správně</span>
          <span className="flex items-center gap-1"><i className="h-3 w-3 rounded bg-rose-500" /> špatně</span>
          <span className="flex items-center gap-1"><i className="h-3 w-3 rounded bg-amber-400" /> napůl</span>
          <span className="flex items-center gap-1"><i className="h-3 w-3 rounded border-2 border-border" /> nevyplněno</span>
        </div>
      </section>

      <section className="flex flex-col gap-3 sm:flex-row">
        <ButtonLink href="/app/mistakes" size="lg" className="sm:flex-1">
          🎯 Trénovat moje slabiny
        </ButtonLink>
        <ButtonLink href="/app/tests" size="lg" variant="secondary" className="sm:flex-1">
          📝 Další test
        </ButtonLink>
      </section>

      {/* review sheet */}
      {open !== null && groupOf.get(open) && (
        <div className="fixed inset-0 z-50 flex justify-center bg-black/40 backdrop-blur-sm sm:p-6" onClick={() => setOpen(null)}>
          <div
            className="scroll-thin flex h-full w-full max-w-3xl flex-col overflow-y-auto bg-bg sm:rounded-3xl sm:border-2 sm:border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b-2 border-border bg-bg/95 px-4 py-3 backdrop-blur">
              <button
                className="grid h-9 w-9 place-items-center rounded-xl hover:bg-surface-2 disabled:opacity-30"
                disabled={openIdx <= 0}
                onClick={() => setOpen(list[openIdx - 1].n)}
                aria-label="Předchozí"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="flex-1 text-center">
                <div className="font-display font-extrabold">Úloha {open}</div>
                <div className="text-xs text-muted">{taskTypeMeta(result.questions.find((q) => q.n === open)!.taskType)?.name}</div>
              </div>
              <button
                className="grid h-9 w-9 place-items-center rounded-xl hover:bg-surface-2 disabled:opacity-30"
                disabled={openIdx < 0 || openIdx >= list.length - 1}
                onClick={() => setOpen(list[openIdx + 1].n)}
                aria-label="Další"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <button className="grid h-9 w-9 place-items-center rounded-xl hover:bg-surface-2" onClick={() => setOpen(null)} aria-label="Zavřít">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 pb-16">
              {(() => {
                const q = result.questions.find((x) => x.n === open)!;
                const ctx = groupOf.get(open)!;
                return (
                  <ReviewTask
                    key={open}
                    taskRef={testRef(test.id, open)}
                    group={ctx.group}
                    tone={ctx.section === "verbal" ? "verbal" : "analytic"}
                    given={q.given}
                    startRevealed={q.status === "correct"}
                  />
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
