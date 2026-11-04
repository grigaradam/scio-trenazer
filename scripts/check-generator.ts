// Self-test of the generator's deterministic checks: every REAL Scio task (all exams) must pass the structural
// checks and the drift guard – if an original fails, the guard is too strict and would reject good AI tasks.
//
//   npm run check:generator
import { examplesFor, generatorPrompt, structuralIssues, styleIssues, styleProfile } from "@/lib/ai/generate";
import { optionShapeIssues } from "@/lib/ai/option-shape";
import { focusOf, steering, type Focus } from "@/lib/ai/variety";
import { TASK_TYPES } from "@/lib/content/exams";
import { groupsOfType } from "@/lib/content/load";
import type { Group, TaskType } from "@/lib/content/types";

let failures = 0;
let checked = 0;
for (const meta of TASK_TYPES) {
  const groups = groupsOfType(meta.exam, meta.id);
  const prof = styleProfile(meta.id);
  console.log(
    `${meta.exam}/${meta.id}: ${groups.length} skupin` +
      (prof ? ` · zadání ${prof.stem.min}–${prof.stem.max} zn.` + (prof.passage ? ` · text ${prof.passage.min}–${prof.passage.max} zn.` : "") : " · bez vzorů!"),
  );
  if (!groups.length) failures++;
  for (const { test, group } of groups) {
    // originals keep their test numbering and may carry figures – renumber like a generated task
    const renumber = new Map(group.questions.map((q, i) => [q.n, i + 1]));
    const g = {
      ...group,
      passage: group.passage?.replace(/\((\d+)\)/g, (m, n) => (renumber.has(Number(n)) ? `(${renumber.get(Number(n))})` : m)),
      questions: group.questions.map((q, i) => ({ ...q, n: i + 1 })),
    };
    const issues = structuralIssues(g, meta.id).filter(
      // originals may carry image figures, and their charts don't follow the generator's grid-density rule
      (i) => !/chybí tabulka nebo graf|málo úloh|chybí společný text|^graf:/.test(i),
    );
    checked++;
    if (issues.length) {
      failures++;
      console.log(`  ✗ ${test.id} ${group.id}: ${issues.join("; ")}`);
    }
  }
}
console.log(`\n${checked} originálních skupin, ${failures} problémů`);

// 2) The prompt must not grow with the pool and must always carry real Scio examples – otherwise the 500th
//    generated task would be steered by the pool instead of by the originals (drift).
console.log("\nVelikost promptu podle počtu úloh v poolu (znaky):");
const fakePool = (type: TaskType, n: number): Focus[] =>
  Array.from({ length: n }, (_, i) =>
    focusOf(type, {
      topic: `téma číslo ${i} oblast ${i % 37}`,
      focus: [`pojem${i}`, `princip${i % 50}`],
      stem: type === "synonyma" ? `Věta s <u>slovo${i}</u>.` : type === "aj_wordform" ? `He was ______ there. (W${i.toString(26).replace(/[0-9]/g, (d) => "ABCDEFGHIJ"[Number(d)]).toUpperCase()}ORD)` : `Zadání ${i}`,
    }),
  );
for (const meta of TASK_TYPES) {
  const sizes = [0, 20, 200, 2000].map((n) => {
    const { text, examples } = examplesFor(meta.exam, meta.id);
    const prompt = generatorPrompt({
      type: meta.id,
      examplesText: text,
      lessons: { lessons: "x".repeat(1200), recent: ["y".repeat(250), "y".repeat(250), "y".repeat(250)] },
      pool: fakePool(meta.id, n).reverse(),
      steer: steering(meta.id, 1)[0],
      variant: 0,
      chartFirst: true,
    });
    if (!examples.length || !prompt.includes("### Vzor 1")) {
      failures++;
      console.log(`  ✗ ${meta.id}: prompt bez skutečných vzorů Scio`);
    }
    return { n, len: prompt.length - text.length }; // examples vary at random, compare the rest
  });
  const grow = sizes[3].len - sizes[1].len;
  // the variety block may list up to 250 words – anything beyond ~12 kB of growth means it is unbounded
  if (grow > 12_000) {
    failures++;
    console.log(`  ✗ ${meta.id}: prompt roste s poolem (+${grow} znaků)`);
  } else console.log(`  ${meta.id}: ${sizes.map((x) => `${x.n}→${x.len}`).join(", ")}`);
}

// 3) The drift guard must catch tasks that left the Scio format.
const first = (type: TaskType) => groupsOfType(TASK_TYPES.find((t) => t.id === type)!.exam, type)[0].group;
const drifted: [string, TaskType, (g: Group) => Group][] = [
  ["čeština v anglické úloze", "aj_grammar", (g) => ({ ...g, questions: g.questions.map((q) => ({ ...q, stem: "Když jsem přišel domů, ______ jsem večeři." })) })],
  ["nafouknutý text", "porozumeni", (g) => ({ ...g, passage: (g.passage ?? "") + " Další odstavec textu.".repeat(400) })],
  ["jednoslovné zadání", "nesoulad", (g) => ({ ...g, questions: g.questions.map((q) => ({ ...q, stem: "Co?" })) })],
  ["angličtina v OSP", "doplnovani", (g) => ({
    ...g,
    questions: g.questions.map((q) => ({
      ...q,
      stem: "The weather was ______ and the road was ______ yesterday evening.",
      parts: q.parts.map((p) => ({ ...p, options: p.options.map((o, i) => ({ ...o, text: ["cold – icy", "warm – dry", "wet – busy", "mild – empty"][i] ?? o.text })) })),
    })),
  })],
];
for (const [label, type, mutate] of drifted) {
  const g = mutate(first(type));
  const caught = styleIssues(g, type).length > 0;
  if (!caught) failures++;
  console.log(`  ${caught ? "✓" : "✗"} pojistka zachytí: ${label}`);
}

// options built by combining two candidates per gap – real Scio options never reuse a word
{
  const g = first("doplnovani");
  const combined = ["imitují – početnější – jedlá", "připomínají – vzácnější – nebezpečná", "napodobují – vzácnější – jedlá", "kopírují – početnější – nebezpečná"];
  const bad = {
    ...g,
    questions: g.questions.map((q) => ({
      ...q,
      stem: "Pestřenky zbarvením ______ vosy. Klam funguje, jsou-li oproti vosám ______ a ptáci znají kořist, která je ______.",
      parts: q.parts.map((p) => ({ ...p, options: p.options.map((o, i) => ({ ...o, text: combined[i] ?? o.text })) })),
    })),
  };
  const caught = optionShapeIssues(bad, "doplnovani").length > 0;
  if (!caught) failures++;
  console.log(`  ${caught ? "✓" : "✗"} pojistka zachytí: slova opakovaná napříč možnostmi`);
}
console.log(`\nCelkem problémů: ${failures}`);
process.exit(failures ? 1 : 0);
