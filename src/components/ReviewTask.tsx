"use client";

import { Eye, RotateCcw, Sparkles } from "lucide-react";
import { useState } from "react";
import type { PublicGroup } from "@/lib/content/public";
import type { OptionKey } from "@/lib/content/types";
import { celebrate } from "@/lib/celebrate";
import { Explanation } from "./Explanation";
import { GroupContext, QuestionBody, type Tone } from "./QuestionView";
import { RichText } from "./RichText";
import { TaskChat } from "./TaskChat";
import { Button } from "./ui";

/**
 * Review of a missed task: "zkus to přepočítat" first (generation effect), then the key,
 * then a step-by-step AI explanation and a chat with the AI tutor.
 */
export function ReviewTask({
  taskRef,
  group,
  tone,
  given,
  onResolved,
  startRevealed = false,
}: {
  taskRef: string;
  group: PublicGroup;
  tone: Tone;
  given?: (OptionKey | null)[];
  onResolved?: (fixed: boolean) => void;
  startRevealed?: boolean;
}) {
  const q = group.questions[0];
  const empty = q.parts.map(() => null) as (OptionKey | null)[];
  const [selected, setSelected] = useState<(OptionKey | null)[]>(startRevealed ? given ?? empty : empty);
  const [reveal, setReveal] = useState<{ answer: OptionKey[]; solution: string } | null>(null);
  const [status, setStatus] = useState<"idle" | "checking" | "wrong" | "right">("idle");
  const [tries, setTries] = useState(0);
  const [explain, setExplain] = useState(false);
  const [xp, setXp] = useState(0);
  const [shake, setShake] = useState(false);
  const [revealing, setRevealing] = useState(false);

  async function check() {
    setStatus("checking");
    const r = await fetch("/api/practice/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: taskRef, answer: selected, reveal: false }),
    });
    const j = await r.json();
    setTries((t) => t + 1);
    if (j.correct) {
      setStatus("right");
      setXp(j.xp ?? 0);
      setReveal({ answer: j.answer, solution: j.solution });
      celebrate("small");
      onResolved?.(true);
    } else {
      setStatus("wrong");
      setShake(true);
      setTimeout(() => setShake(false), 450);
    }
  }

  async function showSolution() {
    setRevealing(true);
    const r = await fetch("/api/reveal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: taskRef }) });
    const j = await r.json();
    if (r.ok) {
      setReveal({ answer: j.answer, solution: j.solution });
      if (status !== "right") setSelected(given ?? selected);
      onResolved?.(false);
    }
    setRevealing(false);
  }

  if (startRevealed && !reveal && status === "idle") {
    // show the key right away (e.g. browsing a whole finished test)
    void showSolution();
    setStatus("checking");
  }

  const givenText = given?.some(Boolean) ? given.map((g) => g ?? "–").join(" / ") : "nevyplněno";
  const complete = selected.every(Boolean);

  return (
    <div className="space-y-4">
      <GroupContext group={group} tone={tone} />
      <div className="rounded-3xl border-2 border-border bg-surface p-4 sm:p-5">
        {!reveal && given && (
          <div className="mb-3 rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">
            Původně: <b className="text-text">{givenText}</b> – zkus si to přepočítat, než se podíváš na řešení. 🧠
          </div>
        )}
        <QuestionBody
          question={q}
          tone={tone}
          selected={selected}
          onSelect={reveal ? undefined : (p, k) => setSelected((s) => s.map((x, i) => (i === p ? k : x)))}
          reveal={reveal ? { answer: reveal.answer } : null}
          wrongShake={shake}
        />

        {!reveal && (
          <div className="mt-4 space-y-2">
            {status === "wrong" && (
              <p className="animate-pop text-center font-bold text-rose-600 dark:text-rose-400">
                Ještě ne. {tries >= 2 ? "Klidně si už ukaž řešení." : "Zkus to znovu! 💪"}
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant={tone} className="sm:flex-1" disabled={!complete} loading={status === "checking"} onClick={check}>
                {status !== "checking" && <RotateCcw className="h-4 w-4" />} {status === "wrong" ? "Zkontrolovat znovu" : "Zkontrolovat"}
              </Button>
              <Button variant="secondary" onClick={showSolution} loading={revealing}>
                {!revealing && <Eye className="h-4 w-4" />} Ukázat řešení
              </Button>
            </div>
          </div>
        )}

        {reveal && (
          <div className="mt-4 animate-fade-up space-y-3">
            {status === "right" && (
              <div className="rounded-2xl bg-emerald-50 p-3 text-center font-display text-lg font-extrabold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                Správně! 🎉 {xp ? `+${xp} XP` : ""}
              </div>
            )}
            <div className="rounded-2xl bg-surface-2 p-3 text-[15px]">
              <div className="mb-1 text-xs font-extrabold uppercase tracking-wider text-muted">Stručné řešení</div>
              <RichText>{reveal.solution}</RichText>
            </div>
          </div>
        )}
      </div>

      {reveal && !explain && (
        <Button variant="primary" size="lg" className="w-full" onClick={() => setExplain(true)}>
          <Sparkles className="h-5 w-5" /> Vysvětli mi to krok za krokem
        </Button>
      )}
      {reveal && explain && <Explanation taskRef={taskRef} given={given} />}
      {reveal && <TaskChat taskRef={taskRef} userAnswer={given?.some(Boolean) ? givenText : null} />}
    </div>
  );
}
