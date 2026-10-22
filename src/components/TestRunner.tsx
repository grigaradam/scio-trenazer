"use client";

import clsx from "clsx";
import { ChevronLeft, ChevronRight, Flag, LogOut, Pause, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnswerMap, PublicGroup, PublicQuestion, PublicTest } from "@/lib/content/public";
import type { OptionKey, SectionId } from "@/lib/content/types";
import { useStudyHeartbeat } from "@/lib/hooks/useStudyHeartbeat";
import { Modal } from "./Modal";
import { GroupContext, QuestionBody } from "./QuestionView";
import { Button } from "./ui";

type Phase = "intro" | "running" | "between" | "submitting";
type TimeLeft = Record<SectionId, number>;

interface Props {
  attemptId: string;
  test: PublicTest;
  initial: { sectionIndex: number; timeLeft: TimeLeft; answers: AnswerMap; flags: number[]; resumed: boolean };
}

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

export function TestRunner({ attemptId, test, initial }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("intro");
  const [sectionIndex, setSectionIndex] = useState(initial.sectionIndex);
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(initial.timeLeft);
  const [answers, setAnswers] = useState<AnswerMap>(initial.answers ?? {});
  const [flags, setFlags] = useState<number[]>(initial.flags ?? []);
  const [paused, setPaused] = useState(false);
  const [cur, setCur] = useState(0);
  const [modal, setModal] = useState<null | "exit" | "end" | "submit">(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);

  const section = test.sections[sectionIndex];
  const tone = section.id === "verbal" ? "verbal" : "analytic";
  const items = useMemo(
    () => section.groups.flatMap((g) => g.questions.map((q) => ({ group: g, q }))),
    [section],
  );
  const item = items[Math.min(cur, items.length - 1)];

  // refs so intervals/unload handlers always see fresh state
  const state = useRef({ answers, flags, timeLeft, sectionIndex, phase });
  useEffect(() => {
    state.current = { answers, flags, timeLeft, sectionIndex, phase };
  });

  useStudyHeartbeat(phase === "running" && !paused);

  // ------------------------------------------------------------------ saving
  const save = useCallback(
    async (extra: Record<string, unknown> = {}, keepalive = false) => {
      const s = state.current;
      try {
        const r = await fetch(`/api/attempts/${attemptId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: s.answers, flags: s.flags, timeLeft: s.timeLeft, sectionIndex: s.sectionIndex, ...extra }),
          keepalive,
        });
        setSaveError(!r.ok && r.status !== 409);
      } catch {
        setSaveError(true);
      }
    },
    [attemptId],
  );

  // debounce answer saves
  useEffect(() => {
    if (phase !== "running") return;
    const t = setTimeout(() => save(), 800);
    return () => clearTimeout(t);
  }, [answers, flags, phase, save]);

  // periodic time save + on hide
  useEffect(() => {
    if (phase !== "running" && phase !== "between") return;
    const i = setInterval(() => save(), 10000);
    const onHide = () => document.visibilityState === "hidden" && save({}, true);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(i);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [phase, save]);

  // warn before closing the tab mid-test
  useEffect(() => {
    if (phase !== "running" && phase !== "between") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      save({}, true);
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [phase, save]);

  // ------------------------------------------------------------------ timer
  const submit = useCallback(async () => {
    setPhase("submitting");
    setModal(null);
    const r = await fetch(`/api/attempts/${attemptId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: state.current.answers }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setToast(data.error ?? "Odevzdání se nepovedlo, zkus to znovu.");
      setPhase("running");
      return;
    }
    const q = new URLSearchParams({ new: "1", xp: String(data.xp ?? 0), ach: (data.achievements ?? []).join(",") });
    router.replace(`/app/results/${attemptId}?${q}`);
  }, [attemptId, router]);

  const endSection = useCallback(() => {
    setModal(null);
    if (state.current.sectionIndex === 0) {
      setTimeLeft((t) => ({ ...t, verbal: 0 }));
      setPhase("between");
      setTimeout(() => save({ timeLeft: { ...state.current.timeLeft, verbal: 0 } }), 0);
    } else {
      submit();
    }
  }, [save, submit]);

  useEffect(() => {
    if (phase !== "running" || paused) return;
    let last = performance.now();
    let acc = 0;
    const i = setInterval(() => {
      const now = performance.now();
      acc += (now - last) / 1000;
      last = now;
      if (acc < 1) return;
      const whole = Math.floor(acc);
      acc -= whole;
      const before = state.current.timeLeft[section.id];
      const after = Math.max(0, before - whole);
      state.current = { ...state.current, timeLeft: { ...state.current.timeLeft, [section.id]: after } };
      setTimeLeft((t) => ({ ...t, [section.id]: after }));
      if (before > 300 && after <= 300) setToast("Zbývá 5 minut ⏳");
      if (before > 60 && after <= 60) setToast("Poslední minuta! ⏰");
      if (after <= 0) {
        clearInterval(i);
        setToast(state.current.sectionIndex === 0 ? "Čas verbálního oddílu vypršel" : "Čas vypršel – odevzdávám test");
        endSection();
      }
    }, 250);
    return () => clearInterval(i);
  }, [phase, paused, section.id, endSection]);

  const remaining = timeLeft[section.id];

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // ------------------------------------------------------------------ answering
  const select = useCallback(
    (q: PublicQuestion, part: number, key: OptionKey | null) => {
      setAnswers((a) => {
        const prev = a[String(q.n)] ?? q.parts.map(() => null);
        const next = [...prev];
        next[part] = key;
        return { ...a, [String(q.n)]: next };
      });
    },
    [],
  );
  const toggleFlag = useCallback((n: number) => setFlags((f) => (f.includes(n) ? f.filter((x) => x !== n) : [...f, n])), []);
  const isAnswered = (q: PublicQuestion) => (answers[String(q.n)] ?? []).some((x) => x);
  const answeredCount = items.filter((it) => isAnswered(it.q)).length;

  // keyboard shortcuts
  useEffect(() => {
    if (phase !== "running" || paused || modal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toUpperCase();
      if (["A", "B", "C", "D"].includes(k)) select(item.q, 0, k as OptionKey);
      else if (["E", "F", "G", "H"].includes(k) && item.q.parts.length > 1) select(item.q, 1, k as OptionKey);
      else if (["1", "2", "3", "4"].includes(k)) select(item.q, 0, "ABCD"[Number(k) - 1] as OptionKey);
      else if (e.key === "ArrowRight") setCur((c) => Math.min(items.length - 1, c + 1));
      else if (e.key === "ArrowLeft") setCur((c) => Math.max(0, c - 1));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, paused, modal, item, items.length, select]);

  // keep current number visible in the strip
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stripRef.current?.querySelector<HTMLElement>(`[data-i="${cur}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [cur]);

  // ------------------------------------------------------------------ screens
  if (phase === "intro" || phase === "between") {
    const s = test.sections[phase === "between" ? 1 : sectionIndex];
    const sTone = s.id === "verbal" ? "verbal" : "analytic";
    const left = timeLeft[s.id];
    const resumed = phase === "intro" && initial.resumed;
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4 py-10">
        <div className="animate-fade-up rounded-3xl border-2 border-border bg-surface p-6 shadow-xl">
          {phase === "between" && (
            <div className="mb-4 rounded-2xl bg-emerald-50 p-3 text-center font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              🎉 Verbální oddíl je za tebou! Teď se k němu už nelze vrátit.
            </div>
          )}
          {resumed && (
            <div className="mb-4 rounded-2xl bg-amber-50 p-3 text-center font-bold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              Pokračuješ v rozdělaném testu – dokonči ho! 💪
            </div>
          )}
          <div className={clsx("mb-1 text-sm font-extrabold uppercase tracking-wider", sTone === "verbal" ? "text-verbal-600" : "text-analytic-600")}>
            {test.title}
          </div>
          <h1 className="font-display text-3xl font-extrabold">{s.title}</h1>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-surface-2 p-3">
              <div className="text-xs font-bold uppercase text-muted">Úloh</div>
              <div className="font-display text-2xl font-extrabold">{s.groups.reduce((n, g) => n + g.questions.length, 0)}</div>
            </div>
            <div className="rounded-2xl bg-surface-2 p-3">
              <div className="text-xs font-bold uppercase text-muted">{resumed ? "Zbývá času" : "Čas"}</div>
              <div className="font-display text-2xl font-extrabold tabular-nums">{fmt(left)}</div>
            </div>
          </div>
          <ul className="mt-4 space-y-1.5 text-sm text-muted">
            <li>• Správně +1 bod, špatně −⅓ bodu, nevyplněno 0. Kliknutím na zvolenou možnost odpověď zrušíš.</li>
            {s.id === "analytic" && <li>• Kalkulačka není povolena – počítej na papír.</li>}
            <li>• Po vypršení času se oddíl automaticky ukončí. Mezi oddíly se nelze vracet.</li>
            <li className="hidden sm:list-item">• Klávesy: A–D výběr, ←/→ další úloha.</li>
          </ul>
          <Button
            variant={sTone}
            size="lg"
            className="mt-6 w-full"
            onClick={() => {
              if (phase === "between") {
                setSectionIndex(1);
                setCur(0);
                setTimeout(() => save({ sectionIndex: 1 }), 0);
              }
              setPhase("running");
            }}
          >
            <Play className="h-5 w-5" /> {resumed ? "Pokračovat" : `Začít ${s.id === "verbal" ? "verbální" : "analytický"} oddíl`}
          </Button>
          {phase === "intro" && (
            <Button variant="ghost" className="mt-2 w-full" onClick={() => router.push("/app")}>
              Zpět na přehled
            </Button>
          )}
        </div>
      </main>
    );
  }

  if (phase === "submitting") {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
          <div className="font-display text-xl font-bold">Vyhodnocuji test…</div>
        </div>
      </main>
    );
  }

  const low = remaining <= 300;
  const isLast = cur === items.length - 1;
  const longPassage = (item.group.passage?.length ?? 0) > 700;

  return (
    <div className="min-h-dvh">
      {/* header */}
      <header
        className={clsx(
          "sticky top-0 z-30 border-b-2 backdrop-blur",
          tone === "verbal" ? "border-verbal-100 bg-verbal-50/90 dark:border-verbal-700/40 dark:bg-[#1a1328]/90" : "border-analytic-100 bg-analytic-50/90 dark:border-analytic-700/40 dark:bg-[#0f1d1c]/90",
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2 sm:gap-4 sm:px-4">
          <span
            className={clsx(
              "rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-white",
              tone === "verbal" ? "bg-verbal-600" : "bg-analytic-600",
            )}
          >
            <span className="sm:hidden">{sectionIndex + 1}/2</span>
            <span className="hidden sm:inline">{section.title}</span>
          </span>
          <div
            className={clsx(
              "font-mono text-xl font-bold tabular-nums sm:text-2xl",
              low ? "text-rose-600 dark:text-rose-400" : "",
              remaining <= 60 && "animate-pulse",
            )}
          >
            {fmt(remaining)}
          </div>
          <div className="hidden text-sm font-semibold text-muted sm:block">
            Vyplněno {answeredCount}/{items.length}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {saveError && <span className="mr-1 text-xs font-bold text-amber-600">⚠ neuloženo</span>}
            <Button variant="secondary" size="sm" onClick={() => { setPaused(true); save({ pause: true }); }} aria-label="Pauza">
              <Pause className="h-4 w-4" />
              <span className="hidden sm:inline">Pauza</span>
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setModal("exit")} aria-label="Odejít">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {/* question strip */}
        <div ref={stripRef} className="scroll-thin mx-auto flex max-w-6xl gap-1.5 overflow-x-auto px-3 pb-2 sm:px-4">
          {items.map((it, i) => {
            const answered = isAnswered(it.q);
            const flagged = flags.includes(it.q.n);
            return (
              <button
                key={it.q.n}
                data-i={i}
                onClick={() => setCur(i)}
                className={clsx(
                  "relative grid h-8 min-w-8 shrink-0 place-items-center rounded-lg border-2 px-1 text-xs font-bold transition",
                  i === cur && "ring-2 ring-offset-1 ring-offset-transparent " + (tone === "verbal" ? "ring-verbal-500" : "ring-analytic-500"),
                  answered
                    ? tone === "verbal"
                      ? "border-verbal-500 bg-verbal-500 text-white"
                      : "border-analytic-500 bg-analytic-500 text-white"
                    : "border-border bg-surface text-muted",
                )}
              >
                {it.q.n}
                {flagged && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-surface" />}
              </button>
            );
          })}
        </div>
      </header>

      {/* body */}
      <main className={clsx("mx-auto px-3 pb-32 pt-4 sm:px-4", longPassage ? "max-w-6xl" : "max-w-3xl")}>
        <div className={clsx(longPassage && "lg:grid lg:grid-cols-2 lg:gap-6")}>
          <div className={clsx(longPassage && "lg:sticky lg:top-28 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:pr-2 scroll-thin")}>
            <GroupContext group={item.group as PublicGroup} tone={tone} compact={!isFirstOfGroup(items, cur)} />
          </div>
          <div className="mt-4 lg:mt-0">
            <div className="rounded-3xl border-2 border-border bg-surface p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-display text-lg font-extrabold">Úloha {item.q.n}</span>
                <button
                  onClick={() => toggleFlag(item.q.n)}
                  className={clsx(
                    "flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition",
                    flags.includes(item.q.n) ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" : "text-muted hover:bg-surface-2",
                  )}
                >
                  <Flag className="h-3.5 w-3.5" /> {flags.includes(item.q.n) ? "Označeno" : "Označit"}
                </button>
              </div>
              <QuestionBody
                question={item.q}
                tone={tone}
                selected={answers[String(item.q.n)] ?? item.q.parts.map(() => null)}
                onSelect={(p, k) => select(item.q, p, k)}
              />
            </div>
          </div>
        </div>
      </main>

      {/* footer nav */}
      <footer className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-3 sm:px-4">
          <Button variant="secondary" onClick={() => setCur((c) => Math.max(0, c - 1))} disabled={cur === 0} aria-label="Předchozí">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 text-center text-sm font-semibold text-muted sm:hidden">
            {answeredCount}/{items.length}
          </div>
          <div className="hidden flex-1 sm:block" />
          {isLast ? (
            <Button variant={tone} onClick={() => setModal(sectionIndex === 0 ? "end" : "submit")}>
              {sectionIndex === 0 ? "Ukončit oddíl" : "Odevzdat test"}
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" className="max-sm:hidden" onClick={() => setModal(sectionIndex === 0 ? "end" : "submit")}>
                {sectionIndex === 0 ? "Ukončit oddíl" : "Odevzdat"}
              </Button>
              <Button variant={tone} onClick={() => setCur((c) => Math.min(items.length - 1, c + 1))}>
                Další <ChevronRight className="h-5 w-5" />
              </Button>
            </>
          )}
        </div>
      </footer>

      {/* pause overlay */}
      {paused && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-bg/95 px-4 backdrop-blur-xl">
          <div className="animate-pop text-center">
            <div className="text-6xl">⏸️</div>
            <h2 className="mt-3 font-display text-3xl font-extrabold">Pauza</h2>
            <p className="mt-2 text-muted">Čas stojí na {fmt(remaining)}. Zadání je skryté.</p>
            <p className="mt-1 text-sm text-muted">Na ostrém testu pauza není – nezdržuj se dlouho. 😉</p>
            <Button variant={tone} size="lg" className="mt-6" onClick={() => setPaused(false)}>
              <Play className="h-5 w-5" /> Pokračovat
            </Button>
          </div>
        </div>
      )}

      <Modal open={modal === "exit"} onClose={() => setModal(null)}>
        <div className="text-4xl">🚪</div>
        <h2 className="mt-2 font-display text-2xl font-extrabold">Opravdu odejít?</h2>
        <p className="mt-2 text-muted">
          Test se uloží a čas se zastaví – dokončit ho můžeš později z přehledu. Ale nejlepší trénink je dodělat ho teď
          v kuse, jako na ostro. 💪
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button variant={tone} size="lg" onClick={() => setModal(null)}>
            Pokračovat v testu
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              setPhase("intro");
              await save();
              router.push("/app");
            }}
          >
            Uložit a odejít
          </Button>
        </div>
      </Modal>

      <Modal open={modal === "end" || modal === "submit"} onClose={() => setModal(null)}>
        <div className="text-4xl">{modal === "end" ? "➡️" : "🏁"}</div>
        <h2 className="mt-2 font-display text-2xl font-extrabold">{modal === "end" ? "Ukončit verbální oddíl?" : "Odevzdat test?"}</h2>
        <p className="mt-2 text-muted">
          Vyplněno {answeredCount} z {items.length} úloh
          {flags.filter((n) => items.some((it) => it.q.n === n)).length > 0 &&
            `, označeno ${flags.filter((n) => items.some((it) => it.q.n === n)).length}`}
          . Zbývá {fmt(remaining)}.
          {modal === "end" && " K verbálnímu oddílu se pak už nepůjde vrátit."}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button variant={tone} size="lg" onClick={endSection}>
            {modal === "end" ? "Ano, pokračovat na analytický" : "Ano, odevzdat"}
          </Button>
          <Button variant="secondary" onClick={() => setModal(null)}>
            Ještě zkontroluji
          </Button>
        </div>
      </Modal>

      {toast && (
        <div className="fixed left-1/2 top-24 z-50 -translate-x-1/2 animate-pop rounded-2xl bg-text px-4 py-2.5 font-bold text-bg shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}

function isFirstOfGroup(items: { group: PublicGroup; q: PublicQuestion }[], i: number) {
  return i === 0 || items[i - 1].group.id !== items[i].group.id;
}
