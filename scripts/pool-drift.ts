// Read-only drift audit of the shared pool: walks the generated tasks of every type in creation order and checks
// whether the later ones drift from the real Scio format (drift guard + structural checks) or lose validator quality.
//
//   npm run pool:drift
import { structuralIssues } from "@/lib/ai/generate";
import { TASK_TYPES } from "@/lib/content/exams";
import type { Group, TaskType } from "@/lib/content/types";
import { createAdminClient } from "@/lib/supabase/admin";

const CHUNK = 20;

async function main() {
  const admin = createAdminClient();
  let total = 0;
  let flagged = 0;
  for (const meta of TASK_TYPES) {
    const rows: { payload: Group; quality: number | null; created_at: string }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin
        .from("generated_tasks")
        .select("payload,quality,created_at")
        .eq("task_type", meta.id)
        .order("created_at", { ascending: true })
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      rows.push(...((data ?? []) as typeof rows));
      if (!data || data.length < 1000) break;
    }
    if (!rows.length) {
      console.log(`${meta.exam}/${meta.id}: v poolu nic`);
      continue;
    }
    const chunks: string[] = [];
    const examples: string[] = [];
    for (let i = 0; i < rows.length; i += CHUNK) {
      const part = rows.slice(i, i + CHUNK);
      let bad = 0;
      const q = part.map((r) => Number(r.quality ?? 0)).filter(Boolean);
      for (const r of part) {
        const issues = structuralIssues(r.payload, meta.id as TaskType);
        if (issues.length) {
          bad++;
          if (examples.length < 4) examples.push(`#${rows.indexOf(r) + 1}: ${issues.slice(0, 2).join("; ")}`);
        }
      }
      total += part.length;
      flagged += bad;
      chunks.push(`${i + 1}–${i + part.length}: kvalita ${q.length ? (q.reduce((a, b) => a + b, 0) / q.length).toFixed(2) : "–"}, mimo formát ${bad}`);
    }
    console.log(`\n${meta.exam}/${meta.id} (${rows.length} úloh)\n  ${chunks.join("\n  ")}`);
    for (const e of examples) console.log("   ⚠", e.slice(0, 240));
  }
  console.log(`\nCelkem ${total} úloh, ${flagged} by dnešní kontrola formátu zamítla.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
