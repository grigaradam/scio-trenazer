"use client";

import clsx from "clsx";
import { ArrowLeft, Sparkles, Timer } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { celebrate } from "@/lib/celebrate";
import { taskTypeMeta } from "@/lib/content/exams";
import type { PublicGroup } from "@/lib/content/public";
import type { OptionKey, TaskType } from "@/lib/content/types";
import { count } from "@/lib/czech";
import { achievementDef } from "@/lib/gamification";
import { useStudyHeartbeat } from "@/lib/hooks/useStudyHeartbeat";
import { emitLiveStats } from "@/lib/liveStats";
import { Explanation } from "./Explanation";
import { GroupContext, QuestionBody, type Tone } from "./QuestionView";
import { RichText } from "./RichText";
import { TaskChat } from "./TaskChat";
import { Badge, Button } from "./ui";

type Mode = "mix" | "mistakes" | "new";

interface Loaded {
  kind: "mistake" | "generated";
  type: TaskType;
  refs: string[];
  group: PublicGroup;
  origin: string;
}

interface Feedback {
  correct: boolean;
  answer: OptionKey[];
  solution: string;
  xp: number;
  fixed: boolean;
  timeout?: boolean;
}

const LIMITS: { label: string; value: number | null }[] = [
  { label: "Bez limitu", value: null },
  { label: "30 s", value: 30 },
  { label: "1 min", value: 60 },
  { label: "1,5 min", value: 90 },
  { label: "2 min", value: 120 },
  { label: "3 min", value: 180 },
  { label: "5 min", value: 300 },
];

const LOADING_TIPS = [
  "AI vymýšlí novou úlohu ve stylu Scio…",
  "Druhá AI ji nezávisle řeší a kontroluje češtinu…",
  "Ověřujeme, že má právě jednu správnou odpověď…",
  "Ukládáme ji do sdílené databáze úloh…",
];

export function PracticeSession({
  types,
  name,
  emoji,
  tone,
  openMistakes,
  initialLimit,
  initialMode,
}: {
  /** one type, or several for a mixed session */
  types: TaskType[];
  name: string;
  emoji: string;
  tone: Tone;
  openMistakes: number;
  initialLimit: number | null;
  initialMode: Mode;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [limit, setLimit] = useState<number | null>(initialLimit);
  const [task, setTask] = useState<Loaded | null>(null);
  const [qi, setQi] = useState(0);
  const [selected, setSelected] = useState<(OptionKey | null)[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [tip, setTip] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);
  const [stats, setStats] = useState({ done: 0, correct: 0, xp: 0, row: 0 });
  const [now, setNow] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [explain, setExplain] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const seen = useRef<string[]>([]);

  useStudyHeartbeat(!loading && !empty);

  const mixed = types.length > 1;
  const taskMeta = task ? taskTypeMeta(task.type) : undefined;
  const taskTone: Tone = mixed && taskMeta ? (taskMeta.section === "verbal" ? "verbal" : "analytic") : tone;
  const question = task?.group.questions[qi];
  const ref = task?.refs[qi];

  const load = useCallback(
    async (m: Mode = mode) => {
      setLoading(true);
      setError(null);
      setEmpty(false);
      setFeedback(null);
      setExplain(false);
      try {
        const r = await fetch("/api/practice/next", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ types, mode: m, exclude: seen.current.slice(-30) }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Nepodařilo se načíst úlohu.");
        if (j.kind === "empty") {
          setEmpty(true);
          setTask(null);
        } else {
          setTask(j);
          setQi(0);
          setSelected(j.group.questions[0].parts.map(() => null));
          setStartedAt(Date.now());
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Chyba");
      } finally {
        setLoading(false);
      }
    },
    [mode, types],
  );

  useEffect(() => {
    // initial fetch on mount
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(initialMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // rotating loading tips
  useEffect(() => {
    if (!loading) return;
    const i = setInterval(() => setTip((t) => (t + 1) % LOADING_TIPS.length), 2500);
    return () => {
      clearInterval(i);
      setTip(-1);
    };
  }, [loading]);

  const submit = useCallback(
    async (timeout = false) => {
      if (!ref || !question || feedback) return;
      const answer = timeout ? question.parts.map(() => null) : selected;
      setSubmitting(true);
      const r = await fetch("/api/practice/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref, answer, timeMs: Date.now() - startedAt, timeLimitSec: limit, reveal: true }),
      });
      const j = await r.json();
      setSubmitting(false);
      if (!r.ok) {
        setError(j.error ?? "Chyba");
        return;
      }
      seen.current.push(ref);
      emitLiveStats({ type: "answer", xp: j.xp ?? 0, streak: j.streak });
      setFeedback({ correct: j.correct, answer: j.answer, solution: j.solution, xp: j.xp, fixed: j.fixed, timeout });
      setStats((s) => ({
        done: s.done + 1,
        correct: s.correct + (j.correct ? 1 : 0),
        xp: s.xp + (j.xp ?? 0),
        row: j.correct ? s.row + 1 : 0,
      }));
      if (j.correct) {
        celebrate("small");
      } else {
        setShake(true);
        setTimeout(() => setShake(false), 450);
      }
      const ach = (j.achievements ?? []).map((c: string) => achievementDef(c)).filter(Boolean);
      if (ach.length) setToast(`${ach[0].emoji} Achievement: ${ach[0].title}`);
    },
    [feedback, limit, question, ref, selected, startedAt],
  );

  // per-task countdown
  const active = Boolean(limit && question && !feedback && !loading && startedAt);
  const left = active && now ? Math.max(0, Math.ceil((startedAt + limit! * 1000 - now) / 1000)) : active ? limit : null;
  useEffect(() => {
    if (!active) return;
    const i = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= startedAt + limit! * 1000) {
        clearInterval(i);
        submit(true);
      }
    }, 250);
    return () => clearInterval(i);
  }, [active, limit, startedAt, submit]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  function next() {
    if (task && qi < task.group.questions.length - 1) {
      const n = qi + 1;
      setQi(n);
      setSelected(task.group.questions[n].parts.map(() => null));
      setFeedback(null);
      setExplain(false);
      setStartedAt(Date.now());
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      load();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function changeLimit(v: number | null) {
    setLimit(v);
    setStartedAt(Date.now());
    fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ practice_time_limit_sec: v }),
    });
  }

  // keyboard: A–D select, Enter submit/next
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || !question) return;
      const k = e.key.toUpperCase();
      if (!feedback && ["A", "B", "C", "D"].includes(k)) setSelected((s) => s.map((x, i) => (i === 0 ? (k as OptionKey) : x)));
      else if (!feedback && ["E", "F", "G", "H"].includes(k) && question.parts.length > 1)
        setSelected((s) => s.map((x, i) => (i === 1 ? (k as OptionKey) : x)));
      else if (e.key === "Enter") {
        if (feedback) next();
        else if (selected.every(Boolean)) submit();
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const accuracy = stats.done ? Math.round((stats.correct / stats.done) * 100) : null;

  return (
    <div className="space-y-4 pb-40">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/app/practice" className="grid h-10 w-10 place-items-center rounded-xl hover:bg-surface-2" aria-label="Zpět">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xl font-extrabold sm:text-2xl">
            {emoji} {name}
          </h1>
          <div className="flex flex-wrap gap-2 text-xs font-bold text-muted">
            <span>{count(stats.done, "úloha", "úlohy", "úloh")}</span>
            {accuracy !== null && <span>· {accuracy} % správně</span>}
            {stats.xp > 0 && <span className="text-brand-600">· +{stats.xp} XP</span>}
            {stats.row >= 3 && <span className="text-orange-500">· 🔥 {stats.row} v řadě</span>}
            {mixed && stats.done === 0 && <span>· {count(types.length, "typ", "typy", "typů")} úloh</span>}
          </div>
        </div>
      </div>

      <div className="scroll-thin -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <div className="flex shrink-0 rounded-xl bg-surface-2 p-1 text-[13px] font-bold sm:text-sm">
          {(
            [
              ["mix", "Mix"],
              ["mistakes", `Moje chyby${openMistakes ? ` (${openMistakes})` : ""}`],
              ["new", "Jen nové"],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                load(m);
              }}
              className={clsx("whitespace-nowrap rounded-lg px-2.5 py-1.5 sm:px-3", mode === m ? "bg-surface shadow-sm" : "text-muted")}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex shrink-0 items-center gap-1.5 rounded-xl bg-surface-2 px-3 py-2 text-[13px] font-bold sm:text-sm">
          <Timer className="h-4 w-4 text-muted" />
          <select
            value={limit ?? ""}
            onChange={(e) => changeLimit(e.target.value ? Number(e.target.value) : null)}
            className="bg-transparent text-base outline-none sm:text-sm"
          >
            {LIMITS.map((l) => (
              <option key={l.label} value={l.value ?? ""}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* body */}
      {loading && (
        <div className="grid place-items-center rounded-3xl border-2 border-dashed border-border py-20 text-center">
          <Sparkles className="h-10 w-10 animate-pulse text-brand-500" />
          <div className="mt-3 font-bold">{mode === "mistakes" || tip < 0 ? "Načítám úlohu…" : LOADING_TIPS[tip]}</div>
          {tip >= 0 && mode !== "mistakes" && (
            <div className="mt-1 animate-fade-up text-sm text-muted">Nová AI úloha může trvat až minutu, další už budou připravené.</div>
          )}
        </div>
      )}

      {error && !loading && (
        <div className="rounded-3xl border-2 border-rose-200 bg-rose-50 p-5 text-center dark:border-rose-900 dark:bg-rose-900/20">
          <p className="font-bold text-rose-700 dark:text-rose-300">{error}</p>
          <Button className="mt-3" onClick={() => load()}>
            Zkusit znovu
          </Button>
        </div>
      )}

      {empty && !loading && (
        <div className="rounded-3xl border-2 border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-900 dark:bg-emerald-900/20">
          <div className="text-4xl">🏆</div>
          <p className="mt-2 font-display text-xl font-extrabold">{mixed ? "Všechny chyby ve vybraných typech máš opravené!" : "Všechny chyby tohoto typu máš opravené!"}</p>
          <Button
            className="mt-4"
            onClick={() => {
              setMode("new");
              load("new");
            }}
          >
            Pokračovat novými úlohami
          </Button>
        </div>
      )}

      {task && question && !loading && (
        <div className="animate-fade-up space-y-4" data-task-scope>
          {mixed && taskMeta && (
            <div className={clsx("font-display text-lg font-extrabold", taskTone === "verbal" ? "text-verbal-600" : "text-analytic-600")}>
              {taskMeta.emoji} {taskMeta.name}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <Badge tone={task.kind === "mistake" ? "warn" : "brand"}>{task.kind === "mistake" ? "🔁 " : "✨ "}{task.origin}</Badge>
            {task.group.questions.length > 1 && (
              <span className="text-xs font-bold text-muted">
                otázka {qi + 1}/{task.group.questions.length}
              </span>
            )}
          </div>
          <GroupContext group={task.group} tone={taskTone} compact={qi > 0} />
          <div className="rounded-3xl border-2 border-border bg-surface p-4 sm:p-5">
            {left !== null && (
              <div className="mb-3 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={clsx("h-full rounded-full transition-[width] duration-300", left <= 10 ? "bg-rose-500" : "bg-brand-500")}
                    style={{ width: `${(left / (limit ?? 1)) * 100}%` }}
                  />
                </div>
                <span className={clsx("font-mono text-sm font-bold tabular-nums", left <= 10 && "text-rose-500")}>{left}s</span>
              </div>
            )}
            <QuestionBody
              question={question}
              tone={taskTone}
              selected={selected}
              onSelect={feedback ? undefined : (p, k) => setSelected((s) => s.map((x, i) => (i === p ? k : x)))}
              reveal={feedback ? { answer: feedback.answer } : null}
              wrongShake={shake}
            />
          </div>

          {feedback && (
            <div className="space-y-3">
              <div className="rounded-2xl bg-surface-2 p-3 text-[15px]">
                <div className="mb-1 text-xs font-extrabold uppercase tracking-wider text-muted">Řešení</div>
                <RichText>{feedback.solution}</RichText>
              </div>
              {!explain ? (
                <Button variant="secondary" className="w-full" onClick={() => setExplain(true)}>
                  <Sparkles className="h-4 w-4" /> Vysvětli mi to krok za krokem
                </Button>
              ) : (
                ref && <Explanation taskRef={ref} given={selected} />
              )}
              {ref && <TaskChat key={ref} taskRef={ref} userAnswer={selected.some(Boolean) ? selected.join(" / ") : null} />}
            </div>
          )}
        </div>
      )}

      {/* bottom action bar (Duolingo style) */}
      {task && question && !loading && (
        <div
          className={clsx(
            "fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 border-t-2 px-4 py-3 transition-colors lg:bottom-0 lg:left-64",
            !feedback && "border-border bg-surface/95 backdrop-blur",
            feedback?.correct && "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-[#0f2a1f]",
            feedback && !feedback.correct && "border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-[#2a1215]",
          )}
        >
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            {feedback ? (
              <>
                <div className="flex-1 animate-pop">
                  <div className={clsx("font-display text-lg font-extrabold", feedback.correct ? "text-emerald-600" : "text-rose-600")}>
                    {feedback.correct
                      ? feedback.fixed
                        ? "Chyba opravena! 🛠️"
                        : ["Výborně! 🎉", "Přesně tak! ✨", "Paráda! 💪", "Správně! 🙌"][stats.done % 4]
                      : feedback.timeout
                        ? "Čas vypršel ⏰"
                        : `Správně je ${feedback.answer.join(" / ")}`}
                  </div>
                  <div className="text-sm font-semibold text-muted">
                    +{feedback.xp} XP{!feedback.correct && " · úloha se uložila do tvých slabin"}
                  </div>
                </div>
                <Button variant={feedback.correct ? "success" : "danger"} size="lg" onClick={next}>
                  Pokračovat
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => submit()} disabled={selected.some(Boolean)}>
                  Nevím
                </Button>
                <div className="flex-1" />
                <Button variant={taskTone} size="lg" disabled={!selected.every(Boolean)} loading={submitting} onClick={() => submit()}>
                  Zkontrolovat
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed left-1/2 top-20 z-50 -translate-x-1/2 animate-pop rounded-2xl bg-text px-4 py-2.5 font-bold text-bg shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
