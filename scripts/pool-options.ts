// Pool tasks whose answer options don't look like real Scio options (a word reused across options,
// gaps ≠ words per option, too many shared words for the type) – see src/lib/ai/option-shape.ts.
//
//   npm run pool:options              report only
//   npm run pool:options -- --retire  retire them too (no longer served, the pool refills the type)
//
// Needs Supabase env in .env.local. Autogen runs the same sweep on its own.
import { optionShape } from "@/lib/ai/option-shape";
import { taskTypeMeta } from "@/lib/content/exams";
import { retireMisshapen } from "@/lib/server/pool";

async function main() {
  const retire = process.argv.includes("--retire");
  const { total, found } = await retireMisshapen({ dryRun: !retire });
  const byType = Map.groupBy(found, (f) => f.type);
  for (const [type, list] of byType) {
    const prof = optionShape(type);
    console.log(`\n=== ${taskTypeMeta(type)?.name}: ${list.length} úloh (originály: sdílená slova max ${Math.round((prof?.maxSharedWords ?? 0) * 100)} %, opakované slovo v mezerách max ${prof?.maxSlotReuse})`);
    for (const f of list.slice(0, 6)) console.log(`  ${f.id}  ${f.issues[0]}\n     ${f.options.slice(0, 200)}`);
  }
  console.log(`\n${found.length} z ${total} úloh aktuální verze mimo tvar Scio${retire ? " – vyřazeno" : " (spusť s --retire pro vyřazení)"}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
