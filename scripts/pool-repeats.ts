// Lists repetition in the shared AI pool: synonym words used more than once and near-identical tasks per type.
//
//   npm run pool:repeats
//
// Needs Supabase env in .env.local. Read-only.
import { TASK_TYPES } from "@/lib/content/exams";
import type { TaskType } from "@/lib/content/types";
import { genericStems, nearDuplicate, poolFocuses } from "@/lib/ai/variety";

async function main() {
  for (const t of TASK_TYPES.filter((x) => x.exam === "osp")) {
    const type = t.id as TaskType;
    const pool = await poolFocuses("osp", type);
    // the same rule as the generator: principles most tasks of the type share don't make two tasks the same
    const generic = genericStems(pool.slice(0, 60).map((p) => p.focus));
    const groups: (typeof pool)[] = [];
    for (const p of pool) {
      const g = groups.find((g) => nearDuplicate(g[0].focus, p.focus, generic));
      if (g) g.push(p);
      else groups.push([p]);
    }
    const repeated = groups.filter((g) => g.length > 1).sort((a, b) => b.length - a.length);
    console.log(`\n=== ${t.name}: ${pool.length} úloh, ${repeated.length} skupin podobných`);
    for (const g of repeated.slice(0, 15)) {
      const label = g[0].focus.headWords.join(" : ") || g[0].focus.topicText;
      console.log(`  ${g.length}× ${label}`);
      for (const p of g) console.log(`     ${p.id}  ${p.focus.headWords.join(" : ")}  ${p.focus.topicText}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
