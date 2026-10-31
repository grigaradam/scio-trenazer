"use client";

import clsx from "clsx";
import { Download, Lock, Pencil, Share2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SITE_URL } from "@/lib/env";
import { renderPetCard } from "@/lib/petCard";
import { achievementDef, levelInfo } from "@/lib/gamification";
import {
  defaultOutfit,
  PET_DEFAULT_NAME,
  PET_FOOD_PER_DAY,
  PET_ITEMS,
  PET_STAGES,
  petGrowth,
  petStage,
  petState,
  type PetInput,
  type PetItem,
  type PetOutfit,
  type PetOverride,
} from "@/lib/pet";
import { PetAvatar } from "./PetAvatar";
import { Button, ButtonLink, buttonClass, Card, ProgressBar, SectionTitle } from "./ui";

const PETTED = ["Hihi! 💜", "To lechtá!", "Ještě!", "Mrrr…", "Jsi nejlepší!", "Pojď na úlohu!"];

const MOOD_LABEL = {
  ecstatic: "V sedmém nebi",
  happy: "Spokojený",
  ok: "V pohodě",
  tired: "Ospalý",
  hungry: "Hladový",
  sad: "Smutný",
  asleep: "Spí",
} as const;

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function PetView({
  userId,
  xp,
  input,
  unlocked,
  override = null,
}: {
  userId: string;
  xp: number;
  input: PetInput;
  unlocked: string[];
  /** admin test mode */
  override?: PetOverride | null;
}) {
  const have = new Set(unlocked);
  const { level } = levelInfo(xp);
  const { stage, index } = petStage(level);
  const growth = petGrowth(xp);
  const state = petState(input, override);

  const [name, setName] = useState(PET_DEFAULT_NAME);
  const [outfit, setOutfit] = useState<PetOutfit>(() => defaultOutfit(have));
  const [editing, setEditing] = useState(false);
  const [hop, setHop] = useState(0);
  const [hearts, setHearts] = useState<{ id: number; x: number; text: string }[]>([]);
  const heroRef = useRef<HTMLDivElement>(null);
  const [card, setCard] = useState<{ file: File; url: string } | null>(null);
  const [making, setMaking] = useState(false);

  async function makeCard() {
    const svg = heroRef.current?.querySelector("svg");
    if (!svg) return;
    setMaking(true);
    try {
      const blob = await renderPetCard(svg, {
        name,
        stage: stage.title,
        level,
        xp,
        streak: input.streak,
        achievements: `${unlocked.length} achievementů`,
        site: SITE_URL.replace(/^https?:\/\//, ""),
      });
      const file = new File([blob], `${name.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.png`, { type: "image/png" });
      setCard({ file, url: URL.createObjectURL(blob) });
    } finally {
      setMaking(false);
    }
  }

  function closeCard() {
    if (card) URL.revokeObjectURL(card.url);
    setCard(null);
  }

  const shareText = `Tohle je ${name}, můj mazlíček z Nanečisto 🐾 Už je na levelu ${level}!`;
  const canShareFile = typeof navigator !== "undefined" && card !== null && Boolean(navigator.canShare?.({ files: [card.file] }));

  async function share() {
    if (!card) return;
    try {
      await navigator.share({ files: [card.file], title: name, text: `${shareText} ${SITE_URL}` });
    } catch {
      // closed the share sheet – nothing to do
    }
  }

  // name and outfit are per-browser cosmetics
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setName(load(`pet:${userId}:name`, PET_DEFAULT_NAME));
    const saved = load<PetOutfit | null>(`pet:${userId}:outfit`, null);
    if (saved) setOutfit(saved);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [userId]);

  // only items that are actually unlocked can be worn
  const worn: PetOutfit = Object.fromEntries(
    Object.entries(outfit).filter(([, code]) => PET_ITEMS.some((i) => i.code === code && have.has(i.achievement))),
  );

  function pet() {
    if (state.mood === "asleep") return;
    setHop((h) => h + 1);
    const id = Date.now();
    setHearts((h) => [...h.slice(-4), { id, x: 30 + Math.random() * 40, text: PETTED[Math.floor(Math.random() * PETTED.length)] }]);
    setTimeout(() => setHearts((h) => h.filter((x) => x.id !== id)), 1400);
  }

  function wear(item: PetItem) {
    const next = { ...worn, [item.slot]: worn[item.slot] === item.code ? null : item.code };
    setOutfit(next);
    save(`pet:${userId}:outfit`, next);
  }

  function rename(v: string) {
    const n = v.trim().slice(0, 20) || PET_DEFAULT_NAME;
    setName(n);
    save(`pet:${userId}:name`, n);
    setEditing(false);
  }

  const needs = [
    {
      emoji: "🍎",
      label: "Sytost",
      value: state.hunger,
      detail: `${Math.min(input.todayTasks, PET_FOOD_PER_DAY)} / ${PET_FOOD_PER_DAY} úloh dnes`,
      hint: "Každá vyřešená úloha = 1 svačinka.",
      bar: "bg-emerald-500",
    },
    {
      emoji: "⚡",
      label: "Energie",
      value: state.energy,
      detail: `${Math.min(input.todayMinutes, input.goalMinutes)} / ${input.goalMinutes} min dnes`,
      hint: "Nabíjí se časem učení až do denního cíle.",
      bar: "bg-amber-400",
    },
    {
      emoji: "💖",
      label: "Radost",
      value: state.joy,
      detail: `streak ${input.streak} · ${input.recentAchievements} ${input.recentAchievements === 1 ? "nový achievement" : "nových achievementů"} za týden`,
      hint: "Roste se streakem a s novými achievementy.",
      bar: "bg-pink-500",
    },
  ];

  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-extrabold">Mazlíček</h1>

      {/* hero */}
      <section
        className={clsx(
          "relative overflow-hidden rounded-3xl border-2 border-border p-5 sm:p-8",
          state.mood === "asleep" || state.mood === "sad"
            ? "bg-gradient-to-b from-slate-100 to-surface dark:from-slate-800/60"
            : "bg-gradient-to-b from-brand-50 to-surface dark:from-brand-900/30",
        )}
      >
        <button
          onClick={makeCard}
          disabled={making}
          aria-label="Sdílet fotku mazlíčka"
          title="Sdílet fotku"
          className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full text-muted opacity-60 transition hover:bg-surface hover:opacity-100 disabled:animate-pulse"
        >
          <Share2 className="h-4 w-4" />
        </button>
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-end">
          <div ref={heroRef} className="relative w-60 shrink-0 sm:w-72">
            <button
              onClick={pet}
              aria-label={`Pohladit ${name}`}
              className="block w-full cursor-pointer select-none [-webkit-tap-highlight-color:transparent]"
            >
              <div key={hop} className={hop ? "animate-pet-hop" : ""}>
                <PetAvatar
                  stage={stage.code}
                  mood={state.mood}
                  needs={state}
                  outfit={worn}
                  className={clsx("w-full motion-safe:animate-pet-bob", state.energy < 0.35 && "[animation-duration:5s]")}
                />
              </div>
            </button>
            {hearts.map((h) => (
              <span
                key={h.id}
                className="pointer-events-none absolute top-6 animate-fade-up whitespace-nowrap rounded-full bg-surface px-2 py-0.5 text-sm font-extrabold text-pink-500 shadow"
                style={{ left: `${h.x}%`, animationDuration: "1.2s" }}
              >
                {h.text}
              </span>
            ))}
          </div>

          <div className="w-full min-w-0 flex-1 space-y-3 text-center sm:text-left">
            <div>
              {editing ? (
                <input
                  autoFocus
                  defaultValue={name}
                  maxLength={20}
                  onBlur={(e) => rename(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && rename(e.currentTarget.value)}
                  className="w-full max-w-xs rounded-xl border-2 border-brand-300 bg-surface px-3 py-1 font-display text-2xl font-extrabold outline-none"
                />
              ) : (
                <button onClick={() => setEditing(true)} className="group inline-flex items-center gap-2 font-display text-3xl font-extrabold">
                  {name}
                  <Pencil className="h-4 w-4 text-muted opacity-60 group-hover:opacity-100" />
                </button>
              )}
              <div className="mt-1 flex flex-wrap justify-center gap-2 text-xs font-bold uppercase tracking-wider text-muted sm:justify-start">
                <span className="rounded-full bg-brand-600 px-2 py-0.5 text-white">{stage.title}</span>
                <span className="rounded-full bg-surface-2 px-2 py-0.5">Level {level}</span>
                <span className="rounded-full bg-surface-2 px-2 py-0.5">{MOOD_LABEL[state.mood]}</span>
                {override && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" title="Potřeby nastavil admin pro testování">
                    🧪 test
                  </span>
                )}
              </div>
            </div>
            <div className="relative rounded-2xl border-2 border-border bg-surface px-4 py-3 text-sm font-semibold shadow-sm">
              <span className="absolute -top-2 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-l-2 border-t-2 border-border bg-surface sm:-left-2 sm:top-1/2 sm:-translate-y-1/2 sm:translate-x-0 sm:-rotate-45" />
              {state.message}
            </div>
            <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
              <ButtonLink href="/app/practice/mix" size="lg">
                🍎 Nakrmit úlohou
              </ButtonLink>
              <ButtonLink href="/app/mistakes" variant="secondary" size="lg">
                🛠️ Zkusit znovu, co mi nešlo
              </ButtonLink>
            </div>
            <p className="text-xs text-muted">
              Každá vyřešená úloha ho nakrmí. Úlohy, ve kterých ses dřív spletl, najdeš ve Slabinách – když je napodruhé dáš správně, dostaneš +10 XP.
            </p>
          </div>
        </div>
      </section>

      {/* needs */}
      <section>
        <SectionTitle>Jak se má</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          {needs.map((n) => (
            <Card key={n.label} className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-display font-extrabold">
                  {n.emoji} {n.label}
                </span>
                <span className="text-sm font-bold text-muted">{Math.round(n.value * 100)} %</span>
              </div>
              <ProgressBar value={n.value} className="h-2.5" barClassName={n.bar} />
              <div className="mt-2 text-xs font-bold text-muted">{n.detail}</div>
              <div className="text-xs text-muted">{n.hint}</div>
            </Card>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Každý den začíná s prázdným bříškem. Když se pár dní neučíš, {name} smutní a nakonec usne.</p>
      </section>

      {/* growth */}
      <section>
        <SectionTitle>Růst</SectionTitle>
        <Card>
          {growth ? (
            <div className="mb-5">
              <div className="mb-1 flex justify-between text-sm font-bold">
                <span>
                  Proměna v „{growth.next.title}“ na levelu {growth.next.level}
                </span>
                <span className="text-muted">ještě {growth.toNext} XP</span>
              </div>
              <ProgressBar value={growth.progress} />
            </div>
          ) : (
            <p className="mb-5 text-sm font-bold">🌟 {name} je v plné síle. Víc už vyrůst nejde – jen zářit.</p>
          )}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {PET_STAGES.map((s, i) => {
              const reached = i <= index;
              return (
                <div
                  key={s.code}
                  className={clsx(
                    "rounded-2xl border-2 p-2 text-center",
                    i === index ? "border-brand-400 bg-brand-50 dark:bg-brand-900/30" : "border-border",
                  )}
                  title={s.description}
                >
                  <PetAvatar
                    stage={s.code}
                    mood="happy"
                    className={clsx("mx-auto w-full max-w-20", !reached && "opacity-25 brightness-0 dark:invert")}
                  />
                  <div className="mt-1 text-xs font-extrabold">{reached ? s.title : "???"}</div>
                  <div className="text-[11px] font-bold text-muted">Level {s.level}</div>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-sm text-muted">{stage.description} Roste s tvým levelem – XP dostáváš za úlohy, testy, opravené chyby a achievementy.</p>
        </Card>
      </section>

      {/* wardrobe */}
      <section>
        <SectionTitle action={<Link href="/app/progress#achievementy" className="text-sm font-bold text-brand-600">Achievementy →</Link>}>
          Šatník · {PET_ITEMS.filter((i) => have.has(i.achievement)).length}/{PET_ITEMS.length}
        </SectionTitle>
        {stage.code === "egg" && <p className="mb-3 text-sm text-muted">Doplňky si {name} obleče, až se vylíhne (level 2).</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PET_ITEMS.map((item) => {
            const open = have.has(item.achievement);
            const on = worn[item.slot] === item.code;
            const ach = achievementDef(item.achievement);
            return (
              <button
                key={item.code}
                disabled={!open}
                onClick={() => wear(item)}
                className={clsx(
                  "rounded-3xl border-2 p-3 text-center transition",
                  on
                    ? "border-brand-400 bg-brand-50 dark:border-brand-600 dark:bg-brand-900/30"
                    : open
                      ? "border-border bg-surface hover:border-brand-300"
                      : "border-dashed border-border bg-surface-2/50",
                )}
              >
                <div className={clsx("text-3xl", !open && "opacity-40 grayscale")}>{item.emoji}</div>
                <div className="mt-1 text-sm font-extrabold">{item.name}</div>
                {open ? (
                  <div className={clsx("text-xs font-bold", on ? "text-brand-600 dark:text-brand-300" : "text-muted")}>{on ? "Má na sobě" : "Obléct"}</div>
                ) : (
                  <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-muted">
                    <Lock className="h-3 w-3" /> {ach?.title}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>
      {card && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onClick={closeCard}>
          <div className="w-full max-w-sm animate-pop rounded-3xl bg-surface p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="font-display text-lg font-extrabold">Fotka pro kamarády</div>
              <button onClick={closeCard} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-surface-2" aria-label="Zavřít">
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={card.url} alt={`${name} – fotka mazlíčka`} className="w-full rounded-2xl border-2 border-border" />
            <div className="mt-3 flex gap-2">
              {canShareFile && (
                <Button className="flex-1" onClick={share}>
                  <Share2 className="h-4 w-4" /> Sdílet
                </Button>
              )}
              <a
                href={card.url}
                download={card.file.name}
                className={buttonClass(canShareFile ? "secondary" : "primary", "md", "flex-1")}
              >
                <Download className="h-4 w-4" /> Stáhnout
              </a>
            </div>
            {!canShareFile && <p className="mt-2 text-center text-xs text-muted">Stáhni si ji a pošli, kam chceš – třeba na Instagram nebo WhatsApp.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
