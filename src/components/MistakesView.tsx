"use client";

import clsx from "clsx";
import { ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { taskTypeMeta } from "@/lib/content/exams";
import { count } from "@/lib/czech";
import type { PublicGroup } from "@/lib/content/public";
import type { TaskType } from "@/lib/content/types";
import { ReviewTask } from "./ReviewTask";
import { Badge, ButtonLink, Card, EmptyState } from "./ui";

interface Item {
  ref: string;
  type: TaskType;
  tries: number;
  source: string;
  origin: string;
  group: PublicGroup;
  updatedAt: string;
}

export function MistakesView({ items, fixedCount, totalOpen }: { items: Item[]; fixedCount: number; totalOpen: number }) {
  const [filter, setFilter] = useState<TaskType | "all">("all");
  const [open, setOpen] = useState<string | null>(null);
  const [fixed, setFixed] = useState<string[]>([]);

  const byType = useMemo(() => {
    const m = new Map<TaskType, number>();
    for (const i of items) m.set(i.type, (m.get(i.type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const list = items.filter((i) => filter === "all" || i.type === filter);
  const current = items.find((i) => i.ref === open);

  if (!items.length)
    return (
      <div className="space-y-6">
        <h1 className="font-display text-3xl font-extrabold">Moje slabiny</h1>
        <EmptyState emoji="🏆" title={fixedCount ? "Všechno opraveno!" : "Zatím žádné chyby"}>
          {fixedCount
            ? `Opravil(a) jsi už ${count(fixedCount, "chybu", "chyby", "chyb")}. Udělej další test nebo trénuj nové úlohy.`
            : "Až uděláš test nebo trénink, sem se uloží úlohy, které ti nešly. Každý den si je můžeš otevřít a opravit."}
        </EmptyState>
        <div className="flex justify-center gap-3">
          <ButtonLink href="/app/tests">Udělat test</ButtonLink>
          <ButtonLink href="/app/practice" variant="secondary">
            Trénink
          </ButtonLink>
        </div>
      </div>
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold">Moje slabiny</h1>
        <p className="mt-1 text-muted">
          Tyhle úlohy ti nešly. Zkus je přepočítat – každá opravená chyba = +15 XP. Ke každému typu máš navíc nekonečno
          nových úloh.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 text-center">
          <div className="font-display text-3xl font-extrabold text-rose-500">{totalOpen - fixed.length}</div>
          <div className="text-xs font-bold uppercase text-muted">k opravě</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="font-display text-3xl font-extrabold text-emerald-500">{fixedCount + fixed.length}</div>
          <div className="text-xs font-bold uppercase text-muted">opraveno</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="font-display text-3xl font-extrabold">{byType.length}</div>
          <div className="text-xs font-bold uppercase text-muted">typů úloh</div>
        </Card>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {byType.map(([type, count]) => {
          const meta = taskTypeMeta(type)!;
          return (
            <div key={type} className="flex items-center gap-3 rounded-2xl border-2 border-border bg-surface p-3">
              <span className="text-2xl">{meta.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{meta.name}</div>
                <div className="text-xs text-muted">{count} k opravě</div>
              </div>
              <ButtonLink href={`/app/practice/${type}?mode=mistakes`} size="sm" variant={meta.section === "verbal" ? "verbal" : "analytic"}>
                Trénovat
              </ButtonLink>
            </div>
          );
        })}
      </div>

      <div>
        <div className="scroll-thin mb-3 flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setFilter("all")}
            className={clsx("shrink-0 rounded-full border-2 px-3 py-1 text-sm font-bold", filter === "all" ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200" : "border-border")}
          >
            Vše ({items.length})
          </button>
          {byType.map(([type, count]) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={clsx("shrink-0 rounded-full border-2 px-3 py-1 text-sm font-bold", filter === type ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200" : "border-border")}
            >
              {taskTypeMeta(type)?.emoji} {count}
            </button>
          ))}
        </div>
        <div className="overflow-hidden rounded-3xl border-2 border-border bg-surface">
          {list.map((i) => {
            const meta = taskTypeMeta(i.type)!;
            const q = i.group.questions[0];
            const preview = (q.stem || q.compare?.left || i.group.passage || "").replace(/[*_$<>\\]|\/?u>/g, "").slice(0, 110);
            const isFixed = fixed.includes(i.ref);
            return (
              <button
                key={i.ref}
                onClick={() => setOpen(i.ref)}
                className={clsx("flex w-full items-center gap-3 border-b-2 border-border px-4 py-3 text-left last:border-b-0 hover:bg-surface-2", isFixed && "opacity-50")}
              >
                <span className="text-xl">{isFixed ? "✅" : meta.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{preview || meta.name}</div>
                  <div className="flex flex-wrap gap-x-2 text-xs text-muted">
                    <span>{i.origin}</span>
                    {i.tries > 0 && <span>· pokusy {i.tries}</span>}
                  </div>
                </div>
                {i.tries >= 2 && !isFixed && <Badge tone="bad">zapeklitá</Badge>}
                <ChevronRight className="h-5 w-5 text-muted" />
              </button>
            );
          })}
        </div>
        {totalOpen > items.length && <p className="mt-2 text-center text-xs text-muted">Zobrazeno {items.length} nejnovějších z {totalOpen}.</p>}
      </div>

      <p className="text-center text-sm text-muted">
        Tip: chyby se nejlépe opravují s odstupem – druhý den si je zkus znovu (rozložené opakování).{" "}
        <Link href="/app/practice" className="font-bold text-brand-600">
          Nové úlohy →
        </Link>
      </p>

      {current && (
        <div className="fixed inset-0 z-50 flex justify-center bg-black/40 backdrop-blur-sm sm:p-6" onClick={() => setOpen(null)}>
          <div className="scroll-thin h-full w-full max-w-3xl overflow-y-auto bg-bg sm:rounded-3xl sm:border-2 sm:border-border" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b-2 border-border bg-bg/95 px-4 py-3 backdrop-blur">
              <div className="flex-1">
                <div className="font-display font-extrabold">{taskTypeMeta(current.type)?.name}</div>
                <div className="text-xs text-muted">{current.origin}</div>
              </div>
              <button className="grid h-9 w-9 place-items-center rounded-xl hover:bg-surface-2" onClick={() => setOpen(null)} aria-label="Zavřít">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 pb-16">
              <ReviewTask
                key={current.ref}
                taskRef={current.ref}
                group={current.group}
                tone={taskTypeMeta(current.type)?.section === "verbal" ? "verbal" : "analytic"}
                onResolved={(ok) => ok && setFixed((f) => [...f, current.ref])}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
