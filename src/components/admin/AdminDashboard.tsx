"use client";

import clsx from "clsx";
import { Ban, Check, Copy, Link2, LogOut, RefreshCw, Unlock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { taskTypeMeta } from "@/lib/content/exams";
import type { AdminStats } from "@/lib/server/admin-stats";
import { Logo } from "../Logo";
import { Badge, Button, Card } from "../ui";

const usd = (v: number) => `$${v < 1 ? v.toFixed(3) : v.toFixed(2)}`;
const num = (v: number, d = 0) => v.toLocaleString("cs-CZ", { maximumFractionDigits: d });
const ago = (iso: string | null) => {
  if (!iso) return "–";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return "teď";
  if (s < 3600) return `před ${Math.round(s / 60)} min`;
  if (s < 86400) return `před ${Math.round(s / 3600)} h`;
  return new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" });
};

export function AdminDashboard({ stats }: { stats: AdminStats }) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const t = stats.totals;
  const p = stats.pool;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 pb-20">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Logo small />
          <Badge tone="brand">Admin</Badge>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={refreshing}
            onClick={() => {
              setRefreshing(true);
              router.refresh();
              setTimeout(() => setRefreshing(false), 800);
            }}
          >
            {!refreshing && <RefreshCw className="h-4 w-4" />} Obnovit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await fetch("/api/admin/logout", { method: "POST" });
              router.refresh();
            }}
          >
            <LogOut className="h-4 w-4" /> Odhlásit
          </Button>
        </div>
      </header>

      {stats.migrationMissing && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
          ⚠️ V Supabase chybí tabulky pro dashboard. Spusť v SQL Editoru soubor <code>supabase/migrations/0002_admin.sql</code>.
        </div>
      )}

      {/* KPI */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Online teď" value={num(t.onlineNow)} hint="aktivní v posledních 5 min" accent />
        <Kpi label="Aktivní dnes" value={num(t.activeToday)} hint={`za 7 dní ${t.activeWeek}`} />
        <Kpi label="Uživatelé" value={num(t.users)} hint={t.blocked ? `${t.blocked} zablokováno` : "nikdo zablokovaný"} />
        <Kpi label="Odučeno celkem" value={`${num(t.hours, 1)} h`} hint={`${num(t.tasksSolved)} úloh · ${t.testsCompleted} testů`} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-display text-lg font-extrabold">Návštěvnost – posledních 7 dní</h2>
          <TrafficBars data={stats.traffic} />
        </Card>
        <Card>
          <h2 className="mb-3 font-display text-lg font-extrabold">Náklady na AI</h2>
          <div className="grid grid-cols-3 gap-2">
            <Mini label="Celkem" value={usd(stats.cost.total)} />
            <Mini label="7 dní" value={usd(stats.cost.week)} />
            <Mini label="Dnes" value={usd(stats.cost.today)} />
          </div>
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted">
              <tr>
                <th className="py-1">Typ</th>
                <th className="py-1 text-right">Volání</th>
                <th className="py-1 text-right">Cena</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["generate", "Generování úloh"],
                  ["validate", "Kontrola úloh"],
                  ["explain", "Vysvětlení"],
                  ["chat", "Chat"],
                ] as const
              ).map(([k, label]) => (
                <tr key={k} className="border-t border-border">
                  <td className="py-1.5">{label}</td>
                  <td className="py-1.5 text-right tabular-nums">{num(stats.cost.byKind[k]?.calls ?? 0)}</td>
                  <td className="py-1.5 text-right tabular-nums">{usd(stats.cost.byKind[k]?.cost ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      {/* question pool */}
      <Card>
        <h2 className="font-display text-lg font-extrabold">AI otázky a recyklace</h2>
        <p className="mb-3 text-sm text-muted">
          Každá vytvořená otázka se ukládá a dostávají ji i další uživatelé – netvoří se pokaždé znovu.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Mini label="Vytvořeno otázek" value={num(p.generated)} hint={p.acceptRate !== null ? `prošlo kontrolou ${Math.round(p.acceptRate * 100)} % pokusů` : undefined} />
          <Mini label="Zobrazeno celkem" value={num(p.serves)} hint={`${num(p.servedTasks)} různých otázek`} />
          <Mini label="Zrecyklováno" value={num(p.recycledServes)} hint={`${num(p.sharedTasks)} otázek dostalo víc lidí`} />
          <Mini
            label="Využití otázky"
            value={p.reuseFactor !== null ? `${num(p.reuseFactor, 2)}×` : "–"}
            hint={p.costPerServe !== null ? `${usd(p.costPerServe)} za zobrazení · ${p.waiting} čeká` : `${p.waiting} čeká připraveno`}
          />
        </div>
        {p.byType.length > 0 && (
          <div className="scroll-thin mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="text-left text-xs uppercase text-muted">
                <tr>
                  <th className="py-1">Typ úlohy</th>
                  <th className="py-1 text-right">Vytvořeno</th>
                  <th className="py-1 text-right">Zobrazeno</th>
                  <th className="py-1 text-right">Poměr</th>
                </tr>
              </thead>
              <tbody>
                {p.byType.map((r) => (
                  <tr key={r.type} className="border-t border-border">
                    <td className="py-1.5">
                      {taskTypeMeta(r.type)?.emoji} {taskTypeMeta(r.type)?.name ?? r.type}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{r.generated}</td>
                    <td className="py-1.5 text-right tabular-nums">{r.serves}</td>
                    <td className="py-1.5 text-right tabular-nums">{r.generated ? `${num(r.serves / r.generated, 1)}×` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <InviteCodes invites={stats.invites} />
      <Users users={stats.users} />
    </div>
  );
}

function Kpi({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <Card className={clsx("p-4", accent && "border-emerald-200 dark:border-emerald-900")}>
      <div className="text-xs font-bold uppercase tracking-wider text-muted">{label}</div>
      <div className={clsx("mt-1 font-display text-3xl font-extrabold", accent && "text-emerald-600")}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </Card>
  );
}

function Mini({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 p-3">
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</div>
      <div className="font-display text-xl font-extrabold tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-muted">{hint}</div>}
    </div>
  );
}

function TrafficBars({ data }: { data: AdminStats["traffic"] }) {
  const max = Math.max(1, ...data.map((d) => d.views));
  return (
    <div>
      <div className="flex items-end gap-2">
        {data.map((d) => (
          <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
            <div className="text-[11px] font-bold tabular-nums text-muted">{d.views || ""}</div>
            <div className="flex h-28 w-full items-end">
              <div className="w-full rounded-t-md bg-brand-500" style={{ height: `${Math.max(3, (d.views / max) * 100)}%` }} />
            </div>
            <div className="text-[11px] font-bold capitalize">{new Date(d.day).toLocaleDateString("cs-CZ", { weekday: "short" })}</div>
            <div className="text-[11px] tabular-nums text-muted">👤 {d.users}</div>
            <div className="text-[11px] tabular-nums text-muted">{d.minutes} min</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">Sloupce = zobrazení stránek, 👤 = počet lidí, min = odučený čas.</p>
    </div>
  );
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  return {
    copied,
    copy: async (key: string, text: string) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        window.prompt("Zkopíruj:", text);
      }
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    },
  };
}

function InviteCodes({ invites }: { invites: AdminStats["invites"] }) {
  const router = useRouter();
  const { copied, copy } = useCopy();
  const [count, setCount] = useState(1);
  const [manual, setManual] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  const [filter, setFilter] = useState<"free" | "used" | "all">("free");
  const link = (code: string) => `${typeof window === "undefined" ? "" : window.location.origin}/signup?code=${encodeURIComponent(code)}`;

  async function create(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setError(null);
    const r = await fetch("/api/admin/codes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) return setError(j.error ?? "Chyba");
    setFresh(j.codes ?? []);
    setManual("");
    router.refresh();
  }

  const list = useMemo(
    () =>
      invites.filter((i) =>
        filter === "all" ? true : filter === "free" ? !i.usedAt && !i.revoked : Boolean(i.usedAt) || i.revoked,
      ),
    [invites, filter],
  );

  return (
    <Card>
      <h2 className="font-display text-lg font-extrabold">Přístupové kódy</h2>
      <p className="mb-3 text-sm text-muted">Každý kód jde použít jen jednou – na registraci nebo na obnovení zablokovaného účtu.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2 rounded-2xl bg-surface-2 p-3">
          <div className="text-sm font-bold">Vygenerovat náhodné</div>
          <div className="flex gap-2">
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="h-10 rounded-xl border-2 border-border bg-surface px-2 text-base font-bold sm:text-sm"
            >
              {[1, 3, 5, 10, 20].map((n) => (
                <option key={n} value={n}>
                  {n}×
                </option>
              ))}
            </select>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Poznámka (komu)"
              maxLength={80}
              className="h-10 min-w-0 flex-1 rounded-xl border-2 border-border bg-surface px-3 text-base outline-none focus:border-brand-500 sm:text-sm"
            />
          </div>
          <Button size="sm" loading={busy === "gen"} onClick={() => create({ count, note }, "gen")}>
            Vygenerovat
          </Button>
        </div>
        <div className="space-y-2 rounded-2xl bg-surface-2 p-3">
          <div className="text-sm font-bold">Vlastní kód</div>
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="např. ADAM-2026"
            maxLength={40}
            className="h-10 w-full rounded-xl border-2 border-border bg-surface px-3 font-mono text-base uppercase outline-none focus:border-brand-500 sm:text-sm"
          />
          <Button size="sm" variant="secondary" disabled={manual.trim().length < 4} loading={busy === "manual"} onClick={() => create({ code: manual, note }, "manual")}>
            Přidat kód
          </Button>
        </div>
      </div>
      {error && <p className="mt-2 text-sm font-semibold text-rose-600">{error}</p>}

      {fresh.length > 0 && (
        <div className="mt-3 animate-pop rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-900/20">
          <div className="mb-2 text-sm font-bold text-emerald-800 dark:text-emerald-200">Nové kódy</div>
          <div className="flex flex-wrap gap-2">
            {fresh.map((c) => (
              <CodeActions key={c} code={c} link={link(c)} copied={copied} copy={copy} />
            ))}
          </div>
          {fresh.length > 1 && (
            <button className="mt-2 text-xs font-bold text-emerald-700 dark:text-emerald-300" onClick={() => copy("all", fresh.map(link).join("\n"))}>
              {copied === "all" ? "✓ Zkopírováno" : "Zkopírovat všechny odkazy"}
            </button>
          )}
        </div>
      )}

      <div className="mb-2 mt-5 flex rounded-xl bg-surface-2 p-1 text-sm font-bold sm:w-fit">
        {(
          [
            ["free", `Volné (${invites.filter((i) => !i.usedAt && !i.revoked).length})`],
            ["used", "Použité / zrušené"],
            ["all", "Vše"],
          ] as const
        ).map(([f, label]) => (
          <button key={f} onClick={() => setFilter(f)} className={clsx("flex-1 rounded-lg px-3 py-1 sm:flex-none", filter === f ? "bg-surface shadow-sm" : "text-muted")}>
            {label}
          </button>
        ))}
      </div>
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-xs uppercase text-muted">
            <tr>
              <th className="py-1">Kód</th>
              <th className="py-1">Poznámka</th>
              <th className="py-1">Stav</th>
              <th className="py-1 text-right">Akce</th>
            </tr>
          </thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.code} className="border-t border-border">
                <td className="py-2 font-mono font-bold">{i.code}</td>
                <td className="py-2 text-muted">{i.note ?? ""}</td>
                <td className="py-2">
                  {i.revoked ? (
                    <Badge>zrušený</Badge>
                  ) : i.usedAt ? (
                    <span className="text-xs text-muted">
                      použil(a) {i.usedByEmail ?? "–"} · {ago(i.usedAt)}
                    </span>
                  ) : (
                    <Badge tone="good">volný</Badge>
                  )}
                </td>
                <td className="py-2">
                  {!i.usedAt && !i.revoked && (
                    <div className="flex justify-end gap-1">
                      <CodeActions code={i.code} link={link(i.code)} copied={copied} copy={copy} compact />
                      <button
                        title="Zrušit kód"
                        className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/30"
                        onClick={async () => {
                          await fetch("/api/admin/codes", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ code: i.code }),
                          });
                          router.refresh();
                        }}
                      >
                        <Ban className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-muted">
                  Žádné kódy.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function CodeActions({
  code,
  link,
  copied,
  copy,
  compact,
}: {
  code: string;
  link: string;
  copied: string | null;
  copy: (key: string, text: string) => void;
  compact?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {!compact && <span className="font-mono font-bold">{code}</span>}
      <button
        title="Zkopírovat kód"
        onClick={() => copy(`c:${code}`, code)}
        className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
      >
        {copied === `c:${code}` ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      </button>
      <button
        title="Zkopírovat pozvánkový odkaz"
        onClick={() => copy(`l:${code}`, link)}
        className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
      >
        {copied === `l:${code}` ? <Check className="h-4 w-4 text-emerald-600" /> : <Link2 className="h-4 w-4" />}
      </button>
    </span>
  );
}

function Users({ users }: { users: AdminStats["users"] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <Card>
      <h2 className="font-display text-lg font-extrabold">Uživatelé ({users.length})</h2>
      <p className="mb-3 text-sm text-muted">
        Zablokovaný uživatel si nechá účet i data, ale po přihlášení musí zadat nový přístupový kód.
      </p>
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left text-xs uppercase text-muted">
            <tr>
              <th className="py-1">Uživatel</th>
              <th className="py-1 text-right">Level</th>
              <th className="py-1 text-right">Streak</th>
              <th className="py-1 text-right">Hodiny</th>
              <th className="py-1 text-right">Úlohy</th>
              <th className="py-1 text-right">Testy</th>
              <th className="py-1 text-right">Vytvořil otázek</th>
              <th className="py-1 text-right">AI cena</th>
              <th className="py-1">Naposledy</th>
              <th className="py-1 text-right">Přístup</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={clsx("border-t border-border", u.blocked && "opacity-60")}>
                <td className="py-2">
                  <div className="font-bold">{u.name ?? "–"}</div>
                  <div className="text-xs text-muted">
                    {u.email}
                    {u.inviteCode ? ` · ${u.inviteCode}` : ""}
                  </div>
                </td>
                <td className="py-2 text-right tabular-nums">
                  {u.level} <span className="text-xs text-muted">({num(u.xp)} XP)</span>
                </td>
                <td className="py-2 text-right tabular-nums">
                  {u.streak} <span className="text-xs text-muted">/ {u.streakBest}</span>
                </td>
                <td className="py-2 text-right tabular-nums">{num(u.hours, 1)}</td>
                <td className="py-2 text-right tabular-nums">{num(u.tasks)}</td>
                <td className="py-2 text-right tabular-nums">{u.tests}</td>
                <td className="py-2 text-right tabular-nums">{u.generated}</td>
                <td className="py-2 text-right tabular-nums">
                  {usd(u.costUsd)} <span className="text-xs text-muted">({u.aiCalls})</span>
                </td>
                <td className="py-2 text-xs text-muted">{ago(u.lastSeenAt ?? u.lastSignInAt)}</td>
                <td className="py-2 text-right">
                  <Button
                    size="sm"
                    variant={u.blocked ? "success" : "secondary"}
                    loading={busy === u.id}
                    onClick={async () => {
                      if (!u.blocked && !window.confirm(`Zablokovat ${u.email}? Bude muset zadat nový kód.`)) return;
                      setBusy(u.id);
                      await fetch("/api/admin/users", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ userId: u.id, blocked: !u.blocked }),
                      });
                      router.refresh();
                      setTimeout(() => setBusy(null), 600);
                    }}
                  >
                    {busy !== u.id && (u.blocked ? <Unlock className="h-4 w-4" /> : <Ban className="h-4 w-4" />)}
                    {u.blocked ? "Odblokovat" : "Zablokovat"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
