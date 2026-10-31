"use client";

import clsx from "clsx";
import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ACHIEVEMENT_CATEGORIES, ACHIEVEMENTS, LEVEL_TITLES, levelInfo, levelThreshold, levelTitle } from "@/lib/gamification";
import { PET_ITEMS, PET_STAGES, petStage, type PetOverride } from "@/lib/pet";
import type { TestOverride } from "@/lib/server/types";
import { Button } from "../ui";

type State = { ready: false; error: string } | { ready: true; xp: number; achievements: string[]; override: TestOverride };

const NEEDS = [
  { key: "hunger", label: "🍎 Sytost" },
  { key: "energy", label: "⚡ Energie" },
  { key: "joy", label: "💖 Radost" },
] as const;

const IDLE = [
  { label: "Skutečnost", value: undefined },
  { label: "Učil se dnes", value: 0 },
  { label: "Včera naposledy", value: 1 },
  { label: "2 dny nic", value: 2 },
  { label: "3+ dny (spí)", value: 3 },
];

/** Admin test mode for one account: level, achievements (= pet items), pet needs – and undo. */
export function TesterPanel({ userId }: { userId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [xpInput, setXpInput] = useState("");
  const [pet, setPet] = useState<PetOverride>({});

  useEffect(() => {
    fetch(`/api/admin/tester?userId=${userId}`)
      .then((r) => r.json())
      .then((s: State) => {
        setState(s);
        if (s.ready) {
          setXpInput(String(s.xp));
          setPet(s.override.pet ?? {});
        }
      });
  }, [userId]);

  async function act(key: string, body: Record<string, unknown>) {
    setBusy(key);
    setError(null);
    const r = await fetch("/api/admin/tester", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...body }),
    });
    const j = await r.json();
    setBusy(null);
    if (!r.ok) return setError(j.error ?? "Chyba");
    setState(j);
    setXpInput(String(j.xp));
    setPet(j.override.pet ?? {});
    router.refresh();
  }

  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => rootRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), [state?.ready]);

  if (!state) return <div className="py-3 text-sm text-muted">Načítám…</div>;
  if (!state.ready)
    return <div className="py-3 text-sm font-bold text-rose-600">Testování potřebuje migraci 0013_test_override.sql (spusť ji v Supabase → SQL Editor).</div>;

  const lvl = levelInfo(state.xp);
  const o = state.override;
  const changed = Boolean(o.xpOffset || o.added.length || o.removed.length || o.pet);
  const have = new Set(state.achievements);
  const itemFor = (code: string) => PET_ITEMS.find((i) => i.achievement === code);

  return (
    <div ref={rootRef} className="space-y-5 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/50 p-4 dark:border-amber-800 dark:bg-amber-900/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-display font-extrabold">🧪 Testovací režim</div>
          <div className="text-xs text-muted">
            {changed
              ? `Upraveno: ${[
                  o.xpOffset ? `${o.xpOffset > 0 ? "+" : ""}${o.xpOffset} XP` : null,
                  o.added.length ? `+${o.added.length} achievementů` : null,
                  o.removed.length ? `−${o.removed.length} achievementů` : null,
                  o.pet ? "mazlíček" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}`
              : "Účet je ve skutečném stavu."}
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={!changed}
          loading={busy === "undo"}
          onClick={() => window.confirm("Vrátit účet do skutečného stavu? Zruší se všechny testovací úpravy.") && act("undo", { action: "undo" })}
        >
          {busy !== "undo" && <RotateCcw className="h-4 w-4" />} Vrátit vše zpět
        </Button>
      </div>
      {error && <div className="text-sm font-bold text-rose-600">{error}</div>}

      {/* level */}
      <section>
        <div className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted">
          Level {lvl.level} · {levelTitle(lvl.level)} · {state.xp.toLocaleString("cs-CZ")} XP · mazlíček: {petStage(lvl.level).stage.title}
          {o.xpOffset !== 0 && ` (skutečně ${(state.xp - o.xpOffset).toLocaleString("cs-CZ")} XP)`}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: LEVEL_TITLES.length + 2 }, (_, i) => i + 1).map((l) => (
            <button
              key={l}
              disabled={busy !== null}
              onClick={() => act(`lvl${l}`, { action: "xp", xp: levelThreshold(l) })}
              title={`${levelTitle(l)} · ${levelThreshold(l)} XP${PET_STAGES.some((s) => s.level === l) ? " · proměna mazlíčka" : ""}`}
              className={clsx(
                "h-8 min-w-8 rounded-lg px-2 text-sm font-extrabold",
                l === lvl.level ? "bg-brand-600 text-white" : "bg-surface hover:bg-surface-2",
                PET_STAGES.some((s) => s.level === l && l > 1) && l !== lvl.level && "ring-2 ring-brand-200 dark:ring-brand-800",
              )}
            >
              {busy === `lvl${l}` ? "…" : l}
            </button>
          ))}
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              act("xp", { action: "xp", xp: Number(xpInput) || 0 });
            }}
          >
            <input
              value={xpInput}
              onChange={(e) => setXpInput(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              className="h-8 w-24 rounded-lg border-2 border-border bg-surface px-2 text-sm tabular-nums"
              aria-label="XP"
            />
            <Button size="sm" variant="secondary" loading={busy === "xp"} type="submit">
              Nastavit XP
            </Button>
          </form>
        </div>
        <div className="mt-1 text-[11px] text-muted">Orámované levely = proměna mazlíčka.</div>
      </section>

      {/* achievements */}
      <section>
        <div className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted">
          Achievementy · {have.size}/{ACHIEVEMENTS.length} — kliknutím přepneš (🎁 = odemyká doplněk mazlíčka)
        </div>
        <div className="space-y-2">
          {ACHIEVEMENT_CATEGORIES.map((cat) => (
            <div key={cat.code} className="flex flex-wrap items-center gap-1.5">
              <span className="w-28 shrink-0 text-xs font-bold">
                {cat.emoji} {cat.title}
              </span>
              {ACHIEVEMENTS.filter((a) => a.category === cat.code).map((a) => {
                const on = have.has(a.code);
                const touched = o.added.includes(a.code) || o.removed.some((r) => r.code === a.code);
                const item = itemFor(a.code);
                return (
                  <button
                    key={a.code}
                    disabled={busy !== null}
                    onClick={() => act(a.code, { action: "achievement", code: a.code, on: !on })}
                    title={`${a.description}${item ? ` · odemyká: ${item.name}` : ""}${touched ? " · změněno v testu" : ""}`}
                    className={clsx(
                      "relative rounded-full border-2 px-2 py-0.5 text-xs font-bold",
                      on ? "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200" : "border-border bg-surface text-muted",
                      busy === a.code && "animate-pulse",
                    )}
                  >
                    {a.emoji} {a.title}
                    {item && <span className="ml-1">{item.emoji}</span>}
                    {touched && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-brand-500" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {/* pet */}
      <section>
        <div className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted">
          Mazlíček — co nezaškrtneš, počítá se ze skutečného učení
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {NEEDS.map((n) => {
            const v = pet[n.key];
            return (
              <label key={n.key} className="rounded-xl bg-surface p-3">
                <div className="mb-1 flex items-center justify-between text-sm font-bold">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={v !== undefined}
                      onChange={(e) => setPet((p) => ({ ...p, [n.key]: e.target.checked ? 0.5 : undefined }))}
                    />
                    {n.label}
                  </span>
                  <span className="tabular-nums text-muted">{v === undefined ? "skutečná" : `${Math.round(v * 100)} %`}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  disabled={v === undefined}
                  value={Math.round((v ?? 0.5) * 100)}
                  onChange={(e) => setPet((p) => ({ ...p, [n.key]: Number(e.target.value) / 100 }))}
                  className="w-full accent-brand-600 disabled:opacity-40"
                />
              </label>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold">Naposledy se učil:</span>
          <select
            value={pet.idleDays ?? ""}
            onChange={(e) => setPet((p) => ({ ...p, idleDays: e.target.value === "" ? undefined : Number(e.target.value) }))}
            className="h-8 rounded-lg border-2 border-border bg-surface px-2 text-sm"
          >
            {IDLE.map((i) => (
              <option key={i.label} value={i.value ?? ""}>
                {i.label}
              </option>
            ))}
          </select>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="secondary"
            disabled={!o.pet}
            loading={busy === "petReset"}
            onClick={() => act("petReset", { action: "pet", pet: null })}
          >
            Skutečné potřeby
          </Button>
          <Button
            size="sm"
            loading={busy === "pet"}
            onClick={() =>
              act("pet", { action: "pet", pet: Object.fromEntries(Object.entries(pet).filter(([, v]) => v !== undefined)) })
            }
          >
            Uložit mazlíčka
          </Button>
        </div>
      </section>
    </div>
  );
}
