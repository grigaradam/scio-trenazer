import { taskTypeMeta } from "@/lib/content/exams";
import type { AdminStats } from "@/lib/server/admin-stats";

// The "Report pro Clauda" from the dashboard: everything needed to optimize the cost and quality of AI tasks, as
// plain text to paste into a chat. Exact numbers come from the database aggregates (migration 0016); without them the
// report says so and falls back to what the dashboard has. Pure function – shared by the dashboard and the scripts.

const usd = (v: number | null | undefined, digits = 4) => (v === null || v === undefined ? "–" : `$${v.toFixed(v >= 10 ? 2 : digits)}`);
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "–" : `${Math.round(v * 100)} %`);
const num = (v: number | null | undefined, digits = 0) => (v === null || v === undefined ? "–" : v.toFixed(digits));
const avg = (total: number, count: number) => (count ? Math.round(total / count) : 0);
const row = (cells: (string | number)[]) => `| ${cells.join(" | ")} |`;
const table = (head: string[], rows: (string | number)[][]) =>
  rows.length ? [row(head), row(head.map(() => "---")), ...rows.map(row)] : ["(žádná data)"];

export function buildReport(stats: AdminStats) {
  const name = (t: string) => taskTypeMeta(t)?.name ?? t;
  const o = stats.optimization;
  const a = stats.autogen;
  const L: string[] = [];
  const h = (title: string) => L.push("", `## ${title}`);

  L.push(`# Report generátoru – ${new Date().toLocaleString("cs-CZ")}`);
  L.push(
    o
      ? `Podklad pro optimalizaci ceny a kvality AI úloh. Okno ${o.windowDays} dní (poptávka 7 dní, tempo 48 h), částky v USD, přesně z databáze.`
      : "⚠️ Bez migrace 0016_admin_report.sql – čísla jsou z řádků omezených na 1000 na dotaz a podrobné sekce chybí.",
  );

  h("Konfigurace");
  L.push(`Generování: ${a.mode === "batch" ? "Batch API (−50 %)" : a.mode === "sync" ? "synchronně (plná cena)" : "synchronně (bez migrace 0015)"}, ${a.enabled ? "zapnuto" : "vypnuto"}, ×${a.workers}`);
  for (const [k, v] of Object.entries(stats.config)) L.push(`- ${k}: ${v}`);

  h("Náklady");
  const c = stats.cost;
  L.push(`Celkem ${usd(c.total, 2)} · 7 dní ${usd(c.week, 2)} · dnes ${usd(c.today, 2)}`);
  L.push(
    `Podle druhu (celkem): ${Object.entries(c.byKind)
      .filter(([k]) => k !== "accept" && k !== "reject")
      .sort((x, y) => y[1].cost - x[1].cost)
      .map(([k, v]) => `${k} ${v.calls}× ${usd(v.cost, 2)}`)
      .join(", ")}`,
  );
  if (o) {
    const w = o.window;
    L.push(
      `Za ${o.windowDays} dní: ${usd(w.spend, 2)} = generování ${usd(w.generation, 2)} (přes Batch API ${usd(w.batchGeneration, 2)}, ${pct(w.generation ? w.batchGeneration / w.generation : null)}) + vysvětlení ${usd(w.explain, 2)} + chat ${usd(w.chat, 2)} + ostatní ${usd(w.other, 2)}`,
    );
    if (o.untyped.calls) L.push(`(${o.untyped.calls} volání generování za ${usd(o.untyped.cost, 2)} je zapsáno před migrací 0015 – bez typu úlohy)`);
  }

  h("Tempo");
  if (a.startedAt) {
    const hours = Math.max(1 / 60, (Date.now() - Date.parse(a.startedAt)) / 3_600_000);
    L.push(
      `Od zapnutí nekonečného generování (${new Date(a.startedAt).toLocaleString("cs-CZ")}, ${num(hours, 1)} h): ${a.generatedSinceStart} úloh (${num(a.generatedSinceStart / hours, 1)}/h), ${usd(a.costSinceStart, 2)} (${usd(a.costSinceStart / hours, 2)}/h, ${usd(a.generatedSinceStart ? a.costSinceStart / a.generatedSinceStart : null)}/úloha)`,
    );
  }
  if (a.batch) L.push(`Dávky teď: tvorba ${a.batch.generating}, kontrola ${a.batch.validating} (z toho variant ${a.batch.variants}), čeká na odeslání ${a.batch.waiting}, otevřených dávek ${a.batch.batches}`);
  if (o?.hourly.length) {
    const last24 = o.hourly.filter((x) => Date.parse(x.hour) >= Date.now() - 24 * 3_600_000);
    const acc = last24.reduce((s, x) => s + x.accepts, 0);
    const gen = last24.reduce((s, x) => s + x.generation, 0);
    L.push(`Posledních 24 h: ${acc} přijatých úloh, generování ${usd(gen, 2)} (${usd(acc ? gen / acc : null)}/úloha)`);
    L.push("Po hodinách (48 h):");
    L.push(
      ...table(
        ["hodina", "přijato", "zamítnuto pokusů", "$ generování", "z toho batch", "$ vysvětlení", "$ chat"],
        o.hourly.map((x) => [
          new Date(x.hour).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }),
          x.accepts,
          x.rejects,
          usd(x.generation, 3),
          usd(x.batch, 3),
          usd(x.explain, 3),
          usd(x.chat, 3),
        ]),
      ),
    );
  }

  if (o) {
    const types = o.types.filter((t) => t.candidates || t.accepted || t.rejectedAttempts || t.total);
    const fromTyped = Date.parse(o.typedSince) > Date.parse(o.windowStart) + 60_000;
    h(`Cena a úspěšnost po typech (${fromTyped ? `od ${new Date(o.typedSince).toLocaleString("cs-CZ")}, kdy se volání zapisují s typem úlohy` : `${o.windowDays} dní`})`);
    L.push("kandidát = první pokus generátoru; $/úloha = vše za generování ÷ přijaté úlohy (vč. zahozených pokusů)");
    L.push(
      ...table(
        ["typ", "$/úloha", "$/kandidát", "kandidátů", "přijato", "napoprvé", "po opravě", "lehké", "varianty", "zahozeno", "zamítnutých pokusů", "$ tvorba", "$ kontrola", "$ ostatní", "thinking", "z cache", "batch"],
        types.map((t) => [
          name(t.type),
          usd(t.perTask),
          usd(t.perCandidate),
          t.candidates,
          t.accepted,
          t.first,
          t.revised,
          t.easyAccepted,
          t.variantsAccepted,
          t.finalFailures,
          t.rejectedAttempts,
          usd(t.generateCost, 3),
          usd(t.validateCost, 3),
          usd(t.otherCost, 3),
          pct(t.thinkingShare),
          pct(t.cacheShare),
          pct(t.batchShare),
        ]),
      ),
    );
    const tot = types.reduce(
      (s, t) => ({ spend: s.spend + t.spend, accepted: s.accepted + t.accepted, candidates: s.candidates + t.candidates }),
      { spend: 0, accepted: 0, candidates: 0 },
    );
    L.push(`Celkem: ${usd(tot.spend, 2)}, ${tot.accepted} úloh z ${tot.candidates} kandidátů → ${usd(tot.accepted ? tot.spend / tot.accepted : null)}/úloha`);

    h(`Volání podle fáze a modelu (${o.windowDays} dní, průměr na volání)`);
    L.push(
      ...table(
        ["fáze", "model", "batch", "volání", "$", "$/volání", "vstup", "z cache", "zápis cache", "z toho 1h", "výstup", "thinking", "podíl z cache"],
        o.stages.map((s) => [
          s.stage,
          s.model,
          s.batch ? "ano" : "ne",
          s.calls,
          usd(s.cost, 3),
          usd(s.calls ? s.cost / s.calls : null),
          avg(s.input, s.calls),
          avg(s.cacheRead, s.calls),
          avg(s.cacheWrite, s.calls),
          avg(s.cacheWrite1h, s.calls),
          avg(s.output, s.calls),
          avg(s.thinking, s.calls),
          pct(s.input + s.cacheRead + s.cacheWrite ? s.cacheRead / (s.input + s.cacheRead + s.cacheWrite) : null),
        ]),
      ),
    );

    h(`Důvody zamítnutí (${o.windowDays} dní, všechny pokusy)`);
    L.push(...table(["důvod", "napoprvé", "po opravě"], o.rejectReasons.map((r) => [r.outcome, r.first, r.revised])));
    if (o.lowScores.length) L.push(`Nízká skóre (z posledních ${o.lowScoreSample} zamítnutí): ${o.lowScores.map((x) => `${x.score} ${x.n}×`).join(", ")}`);
    const tops = types.filter((t) => t.rejects.length);
    if (tops.length) {
      L.push("Nejčastější důvody po typech:");
      for (const t of tops) L.push(`- ${name(t.type)}: ${t.rejects.slice(0, 4).map((r) => `${r.outcome} ${r.n}×`).join(", ")}`);
    }

    h("Zásoba a poptávka");
    L.push("zásoba na dní = nikdy nezobrazené úlohy ÷ průměr zobrazení za den (7 dní); neviděné = co ještě neviděl nejaktivnější uživatel (podle toho se doplňuje)");
    L.push(
      ...table(
        ["typ", "připraveno", "neviděné", "nikdy nezobrazeno", "lehké", "varianty", "rodin", "∅ kvalita", "zobrazení 7 d", "uživatelů 7 d", "zásoba na dní"],
        types.map((t) => [
          name(t.type),
          t.ready,
          stats.pool.byType.find((b) => b.type === t.type)?.stock ?? "–",
          t.neverServed,
          `${t.easy} (${pct(t.ready ? t.easy / t.ready : null)})`,
          `${t.variants} (${pct(t.ready ? t.variants / t.ready : null)})`,
          t.families,
          num(t.quality, 2),
          t.serves7d,
          t.users7d,
          t.daysOfStock === null ? "–" : num(t.daysOfStock, 1),
        ]),
      ),
    );

    h(`Kvalita nových úloh podle validátoru (${o.windowDays} dní, průměr 1–10)`);
    L.push(
      ...table(
        ["typ", "nových", "obtížnost", "chytáky", "jazyk", "slova", "styl", "jednoznačnost", "odhad úspěšnosti"],
        types
          .filter((t) => t.newReady)
          .map((t) => [
            name(t.type),
            t.newReady,
            num(t.scores.difficulty, 1),
            num(t.scores.distractors, 1),
            num(t.scores.czech, 1),
            num(t.scores.real_words, 1),
            num(t.scores.scio_style, 1),
            num(t.scores.unambiguous, 1),
            t.scores.predicted === null ? "–" : `${num(t.scores.predicted)} %`,
          ]),
      ),
    );

    h("Dávky (Batch API, úlohy za poslední 3 dny)");
    if (!o.batch) L.push("(tabulka gen_jobs chybí – migrace 0015)");
    else
      L.push(
        ...table(
          ["typ", "druh", "fáze", "úloh", "v dávce", "∅ doba min", "p50 min", "p90 min"],
          o.batch.map((b) => [name(b.type), b.kind, b.stage, b.jobs, b.inBatch, num(b.avgMin, 1), num(b.p50Min, 1), num(b.p90Min, 1)]),
        ),
      );

    h(`Vysvětlení a chat (${o.windowDays} dní)`);
    L.push(
      `Vysvětlení: ${o.explain.length ? o.explain.map((e) => `${e.model} ${e.calls}× ${usd(e.cost, 2)} (${usd(e.calls ? e.cost / e.calls : null)}/ks)`).join(", ") : "žádná"}`,
    );
    L.push(`Chat: ${o.chat.calls}× ${usd(o.chat.cost, 2)} (${usd(o.chat.calls ? o.chat.cost / o.chat.calls : null)}/zpráva)`);
  } else {
    h("Úspěšnost po typech (14 dní): napoprvé / po opravě / zahozeno | připraveno v zásobě");
    for (const r of stats.learning) {
      const ready = stats.pool.byType.find((b) => b.type === r.type)?.ready ?? 0;
      L.push(`- ${name(r.type)} (${r.type}): ${r.first} / ${r.revised} / ${r.failed} | zásoba ${ready}`);
    }
  }

  h("Zásoba a recyklace");
  const p = stats.pool;
  L.push(
    `Vytvořeno ${p.generated}, zobrazeno ${p.serves}× (${p.servedTasks} různých, recyklováno ${p.recycledServes}×, ${p.sharedTasks} úloh dostalo víc lidí), nikdy nezobrazeno ${p.waiting}, cena za zobrazení ${usd(p.costPerServe)}`,
  );

  h("Naučená pravidla");
  const lessons = stats.learning.filter((x) => x.lessons);
  for (const r of lessons) L.push(`### ${name(r.type)}`, r.lessons!.trim());
  if (!lessons.length) L.push("(zatím žádná)");

  h(`Posledních ${stats.rejects.length} důvodů zamítnutí (nejnovější nahoře)`);
  for (const r of stats.rejects) L.push(`- [${new Date(r.at).toLocaleString("cs-CZ")}] ${r.note}`);
  return L.join("\n");
}
