// A/B test of generator settings before switching them in production (dry run – nothing is stored).
// Both arms generate the same number of candidates per type with the same validator; the script reports acceptance,
// validator scores and the real cost per accepted task, and writes a BLIND review file: all accepted tasks shuffled,
// without saying which arm made them, so you can rate them yourself. The arm key is in a separate file.
//
//   npm run ab -- --types slovni,porovnani --n 6 --b model=claude-sonnet-5-5
//   npm run ab -- --types synonyma --n 8 --b first=low --yes
//   npm run ab -- --types data --n 6 --a model=claude-opus-5-5 --b model=claude-haiku-5-5,first=medium
//
// Arm settings: model=<generator model>, first=<effort of the first draft>, revision=<effort of the revision>.
// Needs a valid ANTHROPIC_API_KEY in .env.local. Spends real money (printed before it starts; --yes to run).
import fs from "node:fs";
import path from "node:path";
import { type GenOverrides, generateTasks, generatorModelFor } from "@/lib/ai/generate";
import { taskToPrompt } from "@/lib/ai/format";
import { TASK_TYPES, taskTypeMeta } from "@/lib/content/exams";
import type { Group, TaskType } from "@/lib/content/types";
import { AI } from "@/lib/env";

const args = process.argv.slice(2);
const arg = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const types = arg("types", "").split(",").filter(Boolean) as TaskType[];
const n = Number(arg("n", "6"));
const efforts = ["low", "medium", "high", "xhigh", "max"] as const;

function parseArm(spec: string): GenOverrides {
  const o: GenOverrides = {};
  for (const pair of spec.split(",").filter(Boolean)) {
    const [k, v] = pair.split("=").map((s) => s.trim());
    if (k === "model") o.model = v;
    else if ((k === "first" || k === "revision") && (efforts as readonly string[]).includes(v))
      o[k === "first" ? "firstEffort" : "revisionEffort"] = v as (typeof efforts)[number];
    else throw new Error(`Neznámé nastavení „${pair}“ (model=…, first=low|medium|high, revision=…)`);
  }
  return o;
}
const arms: { name: "A" | "B"; o: GenOverrides }[] = [
  { name: "A", o: parseArm(arg("a", "")) },
  { name: "B", o: parseArm(arg("b", "")) },
];
const describe = (type: TaskType, o: GenOverrides) =>
  `${o.model ?? generatorModelFor(type)}, effort ${o.firstEffort ?? AI.firstEffort}${(o.revisionEffort ?? AI.revisionEffort) !== (o.firstEffort ?? AI.firstEffort) ? ` → oprava ${o.revisionEffort ?? AI.revisionEffort}` : ""}`;

interface Done {
  arm: "A" | "B";
  type: TaskType;
  group: Group;
  scores: Record<string, number>;
  attempt: number;
  easy: boolean;
}

async function main() {
  if (!types.length || types.some((t) => !taskTypeMeta(t))) {
    console.error(`Zadej --types (některé z: ${TASK_TYPES.map((t) => t.id).join(", ")})`);
    process.exit(2);
  }
  if (!process.env.ANTHROPIC_API_KEY?.startsWith("sk-ant-") || process.env.ANTHROPIC_API_KEY.length < 30) {
    console.error("V .env.local chybí platný ANTHROPIC_API_KEY.");
    process.exit(2);
  }
  // rough ceiling at full price (synchronous calls): ~$0.35 per Opus candidate incl. validation and revision
  const estimate = types.length * n * arms.length * 0.35;
  console.log(`A/B: ${types.join(", ")} · ${n} kandidátů na typ a rameno`);
  for (const a of arms) console.log(`  ${a.name}: ${types.map((t) => describe(t, a.o)).filter((v, i, all) => all.indexOf(v) === i).join(" | ")}`);
  console.log(`Odhad ceny: nejvýš ~$${estimate.toFixed(0)} (levnější modely výrazně méně).`);
  if (!args.includes("--yes")) {
    console.log("Spusť znovu s --yes, pokud to chceš zaplatit.");
    return;
  }

  const done: Done[] = [];
  const rows: string[] = [];
  for (const type of types) {
    const meta = taskTypeMeta(type)!;
    for (const a of arms) {
      let cost = 0;
      const started = Date.now();
      const out = await generateTasks({ exam: meta.exam, type, count: n, dryRun: true, overrides: a.o, onCost: (usd) => (cost += usd) });
      for (const x of out.accepted)
        done.push({ arm: a.name, type, group: x.group, scores: x.validation.scores, attempt: x.attempt, easy: x.easy });
      const full = out.accepted.filter((x) => !x.easy);
      const avg = (k: string) => (full.length ? (full.reduce((s, x) => s + (x.validation.scores as Record<string, number>)[k], 0) / full.length).toFixed(1) : "–");
      rows.push(
        [
          type.padEnd(13),
          a.name,
          `přijato ${full.length}/${n}`.padEnd(13),
          `(napoprvé ${full.filter((x) => !x.attempt).length}, lehké ${out.accepted.length - full.length})`.padEnd(24),
          `$/úloha ${full.length ? (cost / full.length).toFixed(3) : "–"}`.padEnd(14),
          `obtížnost ${avg("difficulty")} chytáky ${avg("distractors")} čeština ${avg("czech")} styl ${avg("scio_style")}`,
          `${Math.round((Date.now() - started) / 1000)} s`,
        ].join("  "),
      );
      console.log(rows.at(-1));
      for (const r of out.rejected) console.log(`      ✗ ${r.reason.slice(0, 160)}`);
    }
  }

  // blind review: shuffled, arms hidden
  const shuffled = [...done].sort(() => Math.random() - 0.5);
  const dir = path.join("ab-results", new Date().toISOString().replace(/[:.]/g, "-"));
  fs.mkdirSync(dir, { recursive: true });
  const review = [
    "# Slepé hodnocení AI úloh",
    "",
    "U každé úlohy napiš známku 1–5 (5 = k nerozeznání od skutečné úlohy Scio). Které nastavení úlohu vytvořilo, je v key.json.",
    "",
    ...shuffled.flatMap((d, i) => [`## U${String(i + 1).padStart(2, "0")} · ${taskTypeMeta(d.type)?.name}`, "", taskToPrompt(d.group), "", "Známka: ___", ""]),
  ].join("\n");
  fs.writeFileSync(path.join(dir, "review.md"), review);
  fs.writeFileSync(
    path.join(dir, "key.json"),
    JSON.stringify(Object.fromEntries(shuffled.map((d, i) => [`U${String(i + 1).padStart(2, "0")}`, { arm: d.arm, type: d.type, attempt: d.attempt, easy: d.easy, scores: d.scores }])), null, 2),
  );
  fs.writeFileSync(path.join(dir, "summary.txt"), [...arms.map((a) => `${a.name}: ${JSON.stringify(a.o)}`), "", ...rows].join("\n"));
  console.log(`\nSlepé hodnocení: ${path.join(dir, "review.md")} (klíč ramen v key.json)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
