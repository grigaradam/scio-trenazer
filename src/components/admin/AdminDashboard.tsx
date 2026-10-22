"use client";

import clsx from "clsx";
import { Ban, Check, Copy, Link2, LogOut, RefreshCw, Unlock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { TASK_TYPES, taskTypeMeta } from "@/lib/content/exams";
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
                  ["learn", "Učení z chyb"],
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
        <PoolStock rows={p.byType} />
      </Card>

      <AutoGenerate auto={stats.autogen} />
      <Learning rows={stats.learning} />
      <TestGenerate />
      <ClaudeReport stats={stats} />

      {stats.rejects.length > 0 && (
        <Card>
          <h2 className="font-display text-lg font-extrabold">Zamítnuté AI úlohy (posledních {Math.min(15, stats.rejects.length)})</h2>
          <p className="mb-3 text-sm text-muted">Proč úloha neprošla kontrolou – pomáhá ladit generátor.</p>
          <ul className="space-y-2 text-sm">
            {stats.rejects.slice(0, 15).map((r, i) => (
              <li key={i} className="rounded-xl bg-surface-2 px-3 py-2">
                <span className="mr-2 text-xs font-bold text-muted">{ago(r.at)}</span>
                <span className="break-words">{r.note}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <InviteCodes invites={stats.invites} />
      <Users users={stats.users} />
    </div>
  );
}

function AutoGenerate({ auto }: { auto: AdminStats["autogen"] }) {
  const router = useRouter();
  const { copied, copy } = useCopy();
  const [busy, setBusy] = useState(false);
  const [workers, setWorkers] = useState(auto.workers);
  const [error, setError] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/admin/autogen", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setError(j.error ?? "Chyba");
    // start right away instead of waiting for the next cron minute
    if (r.ok && body.enabled) await fetch("/api/autogen/tick", { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  const cronSql = `-- Plánovač: každou minutu zavolá generátor (spusť jednou v Supabase → SQL Editor)
select cron.unschedule(jobid) from cron.job where jobname = 'autogen-tick';
select cron.schedule('autogen-tick', '* * * * *', $$
  select net.http_post(
    url := '${origin}/api/autogen/tick',
    headers := '{"Authorization": "Bearer ${auto.secret ?? "DOPLN_AUTOGEN_SECRET"}", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
$$);`;

  const cronAlive = auto.cronAlive;
  const waitingCredits = Boolean(auto.creditsExhaustedAt);

  return (
    <Card className={clsx(auto.enabled && "border-emerald-300 dark:border-emerald-800")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-extrabold">Nekonečné generování {auto.enabled ? "🟢" : "⚪"}</h2>
          <p className="text-sm text-muted">
            Běží na serveru i se zavřeným webem, dokud ho nevypneš nebo nedojde kredit. Vždy doplňuje typ, kterého je nejméně.
          </p>
        </div>
        {auto.available && (
          <div className="flex items-center gap-2">
            <select
              value={workers}
              disabled={busy}
              onChange={(e) => {
                setWorkers(Number(e.target.value));
                patch({ workers: Number(e.target.value) });
              }}
              className="h-9 rounded-xl border-2 border-border bg-surface px-2 text-base font-bold sm:text-sm"
              title="Kolik úloh se generuje souběžně"
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}× souběžně
                </option>
              ))}
            </select>
            <Button size="sm" variant={auto.enabled ? "danger" : "success"} loading={busy} onClick={() => patch({ enabled: !auto.enabled })}>
              {auto.enabled ? "Vypnout" : "Zapnout"}
            </Button>
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-sm font-semibold text-rose-600">{error}</p>}

      {!auto.available ? (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
          Nejdřív spusť v Supabase SQL Editoru migraci <code>supabase/migrations/0005_autogen.sql</code>.
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Mini label="Pracuje" value={`${auto.busy} / ${auto.workers}`} hint="generátorů právě teď" />
            <Mini label="Vytvořeno" value={num(auto.generatedSinceStart)} hint="od zapnutí" />
            <Mini label="Utraceno" value={usd(auto.costSinceStart)} hint="od zapnutí" />
            <Mini label="Plánovač" value={cronAlive ? "běží" : "neběží"} hint={auto.lastTickAt ? `naposledy ${ago(auto.lastTickAt)}` : "zatím nikdy"} />
          </div>
          {waitingCredits && (
            <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
              💳 Došel kredit nebo API klíč nefunguje ({ago(auto.creditsExhaustedAt)}). Generování čeká a každých 30 min to zkusí
              znovu – po dobití pokračuje samo.
            </p>
          )}
          {auto.lastError && !waitingCredits && <p className="mt-2 text-xs text-muted">Poslední chyba: {auto.lastError}</p>}
          <details open={!cronAlive} className="mt-4 rounded-2xl border-2 border-dashed border-border p-3">
            <summary className="cursor-pointer text-sm font-bold">
              {cronAlive ? "✓ Plánovač je nastavený (SQL pro jistotu tady)" : "Nastavení plánovače – stačí jednou, pak už jen Zapnout / Vypnout"}
            </summary>
            <div className="mt-2">
              <div className="text-sm">Plánovač v Supabase každou minutu zavolá generátor. Když je generování vypnuté, nic nedělá a nic nestojí.</div>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-muted">
                {!auto.secret && (
                  <li>
                    Ve Vercelu přidej proměnnou <code>AUTOGEN_SECRET</code> (libovolný dlouhý náhodný text) a dej Redeploy.
                  </li>
                )}
                <li>Zkopíruj SQL níže a spusť ho v Supabase → SQL Editor.</li>
                <li>Do minuty se tu „Plánovač“ přepne na „běží“.</li>
              </ol>
              <pre className="scroll-thin mt-2 max-h-56 overflow-auto rounded-xl bg-surface-2 p-3 font-mono text-[11px]">{cronSql}</pre>
              <Button size="sm" variant="secondary" className="mt-2" disabled={!auto.secret} onClick={() => copy("cron", cronSql)}>
                {copied === "cron" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied === "cron" ? "Zkopírováno" : "Zkopírovat SQL"}
              </Button>
            </div>
          </details>
        </>
      )}
    </Card>
  );
}

function TestGenerate() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<Record<string, string>>({});
  const types = useMemo(() => TASK_TYPES.filter((t) => t.exam === "osp"), []);

  async function run() {
    setRunning(true);
    setStatus({});
    const queue = [...types];
    const worker = async () => {
      for (let t = queue.shift(); t; t = queue.shift()) {
        setStatus((s) => ({ ...s, [t.id]: "⏳ generuji…" }));
        try {
          const res = await fetch("/api/admin/pool", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: t.id, force: true }),
          });
          const j = await res.json();
          setStatus((s) => ({
            ...s,
            [t.id]: !res.ok ? `✗ ${j.error ?? "chyba"}` : j.accepted ? "✓ prošla" : `✗ zamítnuta: ${(j.reason ?? "").slice(0, 160)}`,
          }));
        } catch {
          setStatus((s) => ({ ...s, [t.id]: "✗ vypršel čas" }));
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setRunning(false);
    router.refresh();
  }

  const done = Object.values(status).filter((v) => !v.startsWith("⏳"));
  const ok = done.filter((v) => v.startsWith("✓")).length;
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-extrabold">Test generátoru</h2>
          <p className="text-sm text-muted">Vygeneruje po 1 úloze od každého ze 13 typů (≈ 13 úloh, uloží se do zásoby, když projdou).</p>
        </div>
        <Button size="sm" loading={running} onClick={run}>
          Vygenerovat 1 od každého
        </Button>
      </div>
      {Object.keys(status).length > 0 && (
        <>
          <div className="mt-3 text-sm font-bold">
            Prošlo {ok} / {done.length}
            {running ? " (běží…)" : ""}
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {types.map((t) =>
              status[t.id] ? (
                <li key={t.id} className="flex gap-2">
                  <span className="w-44 shrink-0">
                    {t.emoji} {t.name}
                  </span>
                  <span className={clsx("min-w-0 break-words", status[t.id].startsWith("✓") ? "text-emerald-600" : status[t.id].startsWith("✗") ? "text-rose-600" : "text-muted")}>
                    {status[t.id]}
                  </span>
                </li>
              ) : null,
            )}
          </ul>
        </>
      )}
    </Card>
  );
}

function ClaudeReport({ stats }: { stats: AdminStats }) {
  const { copied, copy } = useCopy();
  const report = useMemo(() => buildReport(stats), [stats]);
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-extrabold">Report pro Clauda</h2>
          <p className="text-sm text-muted">Zkopíruj a vlož do chatu – obsahuje vše potřebné k ladění generátoru.</p>
        </div>
        <Button size="sm" onClick={() => copy("report", report)}>
          {copied === "report" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied === "report" ? "Zkopírováno" : "Zkopírovat report"}
        </Button>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-bold text-brand-600">Náhled ({report.length} znaků)</summary>
        <pre className="scroll-thin mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-surface-2 p-3 font-mono text-[11px]">{report}</pre>
      </details>
    </Card>
  );
}

function buildReport(stats: AdminStats) {
  const lines: string[] = [];
  const name = (t: string) => taskTypeMeta(t)?.name ?? t;
  lines.push(`# Report generátoru – ${new Date().toLocaleString("cs-CZ")}`);
  lines.push(`Konfigurace: ${Object.entries(stats.config).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  const c = stats.cost;
  lines.push(
    `Náklady: celkem $${c.total.toFixed(2)}, 7 dní $${c.week.toFixed(2)} | ` +
      Object.entries(c.byKind).map(([k, v]) => `${k}: ${v.calls}× $${v.cost.toFixed(3)}`).join(", "),
  );
  const p = stats.pool;
  lines.push(`Zásoba: vytvořeno ${p.generated}, zobrazeno ${p.serves}, recyklováno ${p.recycledServes}, cena/zobrazení ${p.costPerServe !== null ? `$${p.costPerServe.toFixed(3)}` : "–"}`);
  lines.push("");
  lines.push("## Úspěšnost po typech (14 dní): napoprvé / po opravě / zahozeno | připraveno v zásobě");
  for (const r of stats.learning) {
    const ready = p.byType.find((b) => b.type === r.type)?.ready ?? 0;
    lines.push(`- ${name(r.type)} (${r.type}): ${r.first} / ${r.revised} / ${r.failed} | zásoba ${ready}`);
  }
  lines.push("");
  lines.push("## Naučená pravidla");
  for (const r of stats.learning.filter((x) => x.lessons)) {
    lines.push(`### ${name(r.type)}`);
    lines.push(r.lessons!.trim());
  }
  if (!stats.learning.some((x) => x.lessons)) lines.push("(zatím žádná)");
  lines.push("");
  lines.push(`## Posledních ${stats.rejects.length} důvodů zamítnutí (nejnovější nahoře)`);
  for (const r of stats.rejects) lines.push(`- [${new Date(r.at).toLocaleString("cs-CZ")}] ${r.note}`);
  return lines.join("\n");
}

function Learning({ rows }: { rows: AdminStats["learning"] }) {
  const total = rows.reduce((a, r) => ({ first: a.first + r.first, revised: a.revised + r.revised, failed: a.failed + r.failed }), { first: 0, revised: 0, failed: 0 });
  const all = total.first + total.revised + total.failed;
  const pct = (x: number, n: number) => (n ? `${Math.round((x / n) * 100)} %` : "–");
  return (
    <Card>
      <h2 className="font-display text-lg font-extrabold">Učení generátoru (14 dní)</h2>
      <p className="mb-3 text-sm text-muted">
        Generátor si pamatuje důvody zamítnutí a z nich si dělá pravidla (max. 8 krátkých bodů na typ, přepisují se –
        nerostou). Cíl: co nejvíc úloh projde napoprvé.
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Mini label="Napoprvé" value={pct(total.first, all)} hint={`${total.first} úloh`} />
        <Mini label="Po opravě" value={pct(total.revised, all)} hint={`${total.revised} úloh`} />
        <Mini label="Zahozeno" value={pct(total.failed, all)} hint={`${total.failed} úloh`} />
      </div>
      <div className="scroll-thin mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-xs uppercase text-muted">
            <tr>
              <th className="py-1">Typ úlohy</th>
              <th className="py-1 text-right">Napoprvé</th>
              <th className="py-1 text-right">Po opravě</th>
              <th className="py-1 text-right">Zahozeno</th>
              <th className="py-1 pl-3">Naučená pravidla</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const n = r.first + r.revised + r.failed;
              return (
                <tr key={r.type} className="border-t border-border align-top">
                  <td className="py-1.5">
                    {taskTypeMeta(r.type)?.emoji} {taskTypeMeta(r.type)?.name ?? r.type}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{n ? `${r.first} (${pct(r.first, n)})` : "–"}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.revised || "–"}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.failed || "–"}</td>
                  <td className="py-1.5 pl-3">
                    {r.lessons ? (
                      <details>
                        <summary className="cursor-pointer text-xs font-bold text-brand-600">zobrazit · {ago(r.lessonsAt)}</summary>
                        <pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-muted">{r.lessons}</pre>
                      </details>
                    ) : (
                      <span className="text-xs text-muted">zatím žádná</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PoolStock({ rows }: { rows: AdminStats["pool"]["byType"] }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<Record<string, string>>({});
  const missing = rows.filter((r) => r.ready < 2);

  async function fill() {
    setRunning(true);
    const queue = [...missing];
    // 3 types at a time, one task per request
    const worker = async () => {
      for (let r = queue.shift(); r; r = queue.shift()) {
        let stock = r.ready;
        let rejected = 0;
        // one task per request; up to 5 tries per type to reach 2 ready tasks
        for (let tries = 0; tries < 5 && stock < 2; tries++) {
          setStatus((s) => ({ ...s, [r.type]: `⏳ generuji… (${stock}/2${rejected ? `, ${rejected} zamítnuto` : ""})` }));
          try {
            const res = await fetch("/api/admin/pool", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: r.type, target: 2 }),
            });
            const j = await res.json();
            if (!res.ok) {
              setStatus((s) => ({ ...s, [r.type]: `✗ ${j.error ?? "chyba"}` }));
              break;
            }
            stock = j.stock;
            rejected += j.rejected;
          } catch {
            rejected++;
          }
        }
        setStatus((s) => ({ ...s, [r.type]: `${stock >= 2 ? "✓" : "⚠"} ${stock} připraveno${rejected ? ` · ${rejected} zamítnuto` : ""}` }));
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setRunning(false);
    router.refresh();
  }

  return (
    <div className="mt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted">
          Zásoba pro nové uživatele: u každého typu mají být aspoň 2 hotové úlohy, aby nikdo nečekal na AI.
        </div>
        <Button size="sm" loading={running} disabled={!missing.length} onClick={fill}>
          {missing.length ? `Doplnit zásobu (${missing.length} typů)` : "Zásoba je plná ✓"}
        </Button>
      </div>
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-left text-xs uppercase text-muted">
            <tr>
              <th className="py-1">Typ úlohy</th>
              <th className="py-1 text-right">Připraveno</th>
              <th className="py-1 text-right">Vytvořeno</th>
              <th className="py-1 text-right">Zobrazeno</th>
              <th className="py-1 pl-3">Stav</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.type} className="border-t border-border">
                <td className="py-1.5">
                  {taskTypeMeta(r.type)?.emoji} {taskTypeMeta(r.type)?.name ?? r.type}
                </td>
                <td className={clsx("py-1.5 text-right font-bold tabular-nums", r.ready < 2 ? "text-amber-600" : "text-emerald-600")}>{r.ready}</td>
                <td className="py-1.5 text-right tabular-nums">{r.generated}</td>
                <td className="py-1.5 text-right tabular-nums">{r.serves}</td>
                <td className="py-1.5 pl-3 text-xs text-muted">{status[r.type] ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
