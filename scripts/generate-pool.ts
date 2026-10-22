// Generates AI practice tasks ahead of time (fills the shared pool) or tests generator quality.
//
//   npm run pool -- --dry --type analogie --count 2     # generate + validate, print, don't save
//   npm run pool -- --type all --count 3                # 3 candidates per type into Supabase
//
// Needs ANTHROPIC_API_KEY (and Supabase env for saving) in .env.local.
import { generateTasks } from "@/lib/ai/generate";
import { TASK_TYPES } from "@/lib/content/exams";
import type { TaskType } from "@/lib/content/types";

const args = process.argv.slice(2);
const arg = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const dryRun = args.includes("--dry");
const count = Number(arg("count", "2"));
const typeArg = arg("type", "all");
const types = (typeArg === "all" ? TASK_TYPES.map((t) => t.id) : typeArg.split(",")) as TaskType[];

async function main() {
  let accepted = 0;
  let rejected = 0;
  for (const type of types) {
    const started = Date.now();
    const out = await generateTasks({ exam: "osp", type, count, dryRun });
    accepted += out.accepted.length;
    rejected += out.rejected.length;
    console.log(`\n=== ${type}: ${out.accepted.length} přijato, ${out.rejected.length} zamítnuto (${Math.round((Date.now() - started) / 1000)} s)`);
    for (const r of out.rejected) console.log("  ✗", r.reason.slice(0, 300));
    if (dryRun) {
      for (const a of out.accepted) {
        console.log("  ✓ skóre validátoru", JSON.stringify(a.validation.scores));
        console.log(JSON.stringify(a.group, null, 2).split("\n").map((l) => "    " + l).join("\n"));
      }
    }
  }
  console.log(`\nCelkem: ${accepted} přijato, ${rejected} zamítnuto${dryRun ? " (dry run, nic se neuložilo)" : ""}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
