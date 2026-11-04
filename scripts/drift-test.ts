// Drift test of the AI generator: generates many tasks of a type in rounds (dry run – nothing is saved), feeding the
// accepted ones into a simulated pool exactly like production does. If quality held only for the first tasks and the
// generator started drifting (hallucinated words, off-format tasks, repetitions) as the pool grows, the later rounds
// show it: lower acceptance, lower validator scores, more style/structure rejections.
//
//   npm run drift -- --type aj_grammar --rounds 5 --batch 5
//   npm run drift -- --type synonyma,aj_wordform --rounds 5 --batch 5 --out drift.json
import fs from "node:fs";
import { generateTasks } from "@/lib/ai/generate";
import { focusOf, type Focus } from "@/lib/ai/variety";
import { taskTypeMeta } from "@/lib/content/exams";
import type { Group, TaskType } from "@/lib/content/types";

const args = process.argv.slice(2);
const arg = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const types = arg("type", "aj_grammar").split(",") as TaskType[];
const rounds = Number(arg("rounds", "5"));
const batch = Number(arg("batch", "5"));
const out = arg("out", "");

interface RoundStat {
  round: number;
  poolBefore: number;
  accepted: number;
  rejected: number;
  reasons: Record<string, number>;
  avgScores: Record<string, number>;
  avgPredictedSuccess: number | null;
  samples: string[];
}

const bucket = (r: string) =>
  /opakování/.test(r) ? "opakování" : /^struktura: .*styl:/.test(r) ? "drift stylu" : /^struktura/.test(r) ? "struktura" : /jiná odpověď/.test(r) ? "jiný klíč" : /lehká/.test(r) ? "lehká" : /validátor/.test(r) ? "validátor jinak" : "chyba";

async function run(type: TaskType) {
  const meta = taskTypeMeta(type)!;
  const pool: Focus[] = [];
  const stats: RoundStat[] = [];
  const all: Group[] = [];
  for (let r = 1; r <= rounds; r++) {
    const started = Date.now();
    const res = await generateTasks({ exam: meta.exam, type, count: batch, dryRun: true, simulatedPool: [...pool].reverse() });
    // a bad key or no credit fails every call – stop right away instead of burning through all rounds
    const fatal = res.rejected.find((x) => /authentication_error|invalid x-api-key|credit balance|billing/i.test(x.reason));
    if (fatal && !res.accepted.length) {
      console.error(
        "\n✗ Anthropic API odmítá klíč (nebo chybí kredit) – test nejde spustit.\n" +
          "  Do .env.local dej platný ANTHROPIC_API_KEY (stejný jako na Vercelu) a spusť znovu.\n" +
          `  Odpověď API: ${fatal.reason.slice(0, 160)}`,
      );
      process.exit(2);
    }
    const scores: Record<string, number[]> = {};
    for (const a of res.accepted) {
      for (const [k, v] of Object.entries(a.validation.scores)) (scores[k] ??= []).push(v);
      const g = a.group as Group & { topic?: string; focus?: string[] };
      pool.push(focusOf(type, { topic: g.topic, focus: g.focus, stem: g.questions[0]?.stem }));
      all.push(a.group);
    }
    const reasons: Record<string, number> = {};
    for (const x of res.rejected) reasons[bucket(x.reason)] = (reasons[bucket(x.reason)] ?? 0) + 1;
    const ps = res.accepted.map((a) => a.validation.predictedSuccess);
    const stat: RoundStat = {
      round: r,
      poolBefore: pool.length - res.accepted.length,
      accepted: res.accepted.length,
      rejected: res.rejected.length,
      reasons,
      avgScores: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10])),
      avgPredictedSuccess: ps.length ? Math.round(ps.reduce((a, b) => a + b, 0) / ps.length) : null,
      samples: res.accepted.map((a) => (a.group.questions[0]?.stem ?? "").replace(/\s+/g, " ").slice(0, 110)),
    };
    stats.push(stat);
    console.log(
      `\n[${type}] kolo ${r}/${rounds} (pool ${stat.poolBefore}) · přijato ${stat.accepted}/${batch} · ${Math.round((Date.now() - started) / 1000)} s`,
      `\n  skóre ${JSON.stringify(stat.avgScores)} · odhad úspěšnosti ${stat.avgPredictedSuccess ?? "–"} %`,
      `\n  zamítnutí ${JSON.stringify(reasons)}`,
    );
    for (const x of res.rejected) console.log("   ✗", x.reason.slice(0, 220));
    for (const smp of stat.samples) console.log("   ✓", smp);
  }
  return { type, stats, tasks: all };
}

async function main() {
  const results = [];
  for (const t of types) results.push(await run(t));
  if (out) fs.writeFileSync(out, JSON.stringify(results, null, 2));
  console.log("\n=== Souhrn (přijato / vygenerováno v jednotlivých kolech)");
  for (const r of results) console.log(`${r.type}: ${r.stats.map((s) => `${s.accepted}/${batch}`).join("  ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
