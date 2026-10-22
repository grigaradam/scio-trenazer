"use client";

import { stripQuestion } from "@/lib/content/public";
import type { TestFile } from "@/lib/content/types";
import { GroupContext, QuestionBody } from "../QuestionView";
import { RichText } from "../RichText";

export function ContentPreview({ test, all }: { test: TestFile; all: string[] }) {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <nav className="flex flex-wrap gap-2 text-sm">
        {all.map((id) => (
          <a key={id} href={`/dev/${id}`} className={`rounded-lg px-2 py-1 ${id === test.id ? "bg-brand-600 text-white" : "bg-surface-2"}`}>
            {id}
          </a>
        ))}
      </nav>
      <h1 className="font-display text-2xl font-extrabold">{test.title}</h1>
      {test.sections.map((s) => (
        <section key={s.id} className="space-y-6">
          <h2 className="font-display text-xl font-bold">{s.title}</h2>
          {s.groups.map((g) => (
            <div key={g.id} className="space-y-4 rounded-3xl border-2 border-dashed border-border p-3">
              <div className="text-xs font-bold text-muted">
                {g.id} · {g.taskType}
              </div>
              <GroupContext group={{ ...g, questions: [] }} tone={s.id === "verbal" ? "verbal" : "analytic"} />
              {g.questions.map((q) => (
                <div key={q.n} id={`q${q.n}`} className="rounded-3xl border-2 border-border bg-surface p-4">
                  <div className="mb-2 font-display font-extrabold">
                    Úloha {q.n} {q.excluded && "(vyřazena)"}
                  </div>
                  <QuestionBody
                    question={stripQuestion(q)}
                    tone={s.id === "verbal" ? "verbal" : "analytic"}
                    selected={q.parts.map(() => null)}
                    reveal={{ answer: q.parts.map((p) => p.answer) }}
                  />
                  <div className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">
                    <RichText>{q.solution}</RichText>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
