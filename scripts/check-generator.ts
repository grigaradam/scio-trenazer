// Self-test of the generator's deterministic checks: every REAL Scio task (all exams) must pass the structural
// checks and the drift guard – if an original fails, the guard is too strict and would reject good AI tasks.
//
//   npm run check:generator
import { type Candidate, examplesFor, generatorPromptText, generatorTail, judge, lengthGuide, staticPrompt, structuralIssues, styleIssues, styleProfile, type Validation } from "@/lib/ai/generate";
import { DECKS } from "@/lib/ai/decks";
import { familyAllowed, easyRecently, FAMILY_GAP_DAYS, FAMILY_GAP_TASKS } from "@/lib/ai/families";
import type { Served } from "@/lib/ai/variety";
import { optionShapeIssues } from "@/lib/ai/option-shape";
import { focusOf, repetitionIssue, steering, type Focus } from "@/lib/ai/variety";
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
//    generated task would be steered by the pool instead of by the originals (drift). The per-type part is cached,
//    so it must be byte-identical for every candidate of a deck (a single differing byte = a new cache entry).
console.log("\nVelikost promptu podle počtu úloh v poolu (znaky proměnné části):");
const fakePool = (type: TaskType, n: number): Focus[] =>
  Array.from({ length: n }, (_, i) =>
    focusOf(type, {
      topic: `téma číslo ${i} oblast ${i % 37}`,
      focus: [`pojem${i}`, `princip${i % 50}`],
      stem: type === "synonyma" ? `Věta s <u>slovo${i}</u>.` : type === "aj_wordform" ? `He was ______ there. (W${i.toString(26).replace(/[0-9]/g, (d) => "ABCDEFGHIJ"[Number(d)]).toUpperCase()}ORD)` : `Zadání ${i}`,
    }),
  );
const candidate = (type: TaskType, deck: number): Candidate => ({
  exam: TASK_TYPES.find((t) => t.id === type)!.exam,
  type,
  kind: "fresh",
  deck,
  steer: steering(type, 1)[0],
  index: 0,
  chart: type === "data" ? { use: true, kind: "bar" } : null,
  words: null,
  parent: null,
});
const lessons = { lessons: "x".repeat(1200), recent: ["y".repeat(250), "y".repeat(250), "y".repeat(250)] };
for (const meta of TASK_TYPES) {
  const sizes = [0, 20, 200, 2000].map((n) => {
    const c = candidate(meta.id, 0);
    const prompt = generatorPromptText(c, { lessons, pool: fakePool(meta.id, n).reverse() });
    if (!examplesFor(meta.exam, meta.id, 0).examples.length || !prompt.includes("### Vzor 1")) {
      failures++;
      console.log(`  ✗ ${meta.id}: prompt bez skutečných vzorů Scio`);
    }
    return { n, len: generatorTail(c, { lessons, pool: fakePool(meta.id, n).reverse() }).length };
  });
  const grow = sizes[3].len - sizes[1].len;
  // the variety block may list up to 250 words – anything beyond ~12 kB of growth means it is unbounded
  if (grow > 12_000) {
    failures++;
    console.log(`  ✗ ${meta.id}: prompt roste s poolem (+${grow} znaků)`);
  } else console.log(`  ${meta.id}: ${sizes.map((x) => `${x.n}→${x.len}`).join(", ")}`);
  // decks: deterministic (cacheable) and actually different from each other where the type has enough originals
  const decks = Array.from({ length: DECKS }, (_, d) => staticPrompt(meta.id, d, "fresh"));
  if (decks.some((d, i) => d !== staticPrompt(meta.id, i, "fresh"))) {
    failures++;
    console.log(`  ✗ ${meta.id}: pevná sada vzorů není deterministická – cache by se nikdy nepřečetla`);
  }
  if (new Set(decks).size < Math.min(DECKS, 2) && groupsOfType(meta.exam, meta.id).length > 4) {
    failures++;
    console.log(`  ✗ ${meta.id}: sady vzorů se neliší`);
  }
  if (!lengthGuide(meta.id)) console.log(`  ! ${meta.id}: bez délkového vodítka`);
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
// 4) The easy tier: correct but easy tasks are recognised, real problems are never "easy".
{
  const g = first("doplnovani");
  const key = g.questions[0].parts[0].answer;
  const v = (o: Partial<Omit<Validation, "scores">> & { scores?: Partial<Validation["scores"]> } = {}): Validation => ({
    answers: [[key]],
    reasoning: "",
    predictedSuccess: 50,
    shortcut: false,
    issues: [],
    onlyTooEasy: false,
    verdict: "accept",
    ...o,
    scores: { distractors: 8, unambiguous: 9, czech: 9, real_words: 9, scio_style: 8, difficulty: 8, ...o.scores },
  });
  const one = { ...g, questions: [g.questions[0]] };
  const cases: [string, Validation, string][] = [
    ["dobrá úloha", v(), "accept"],
    ["moc lehká, jinak bezchybná", v({ predictedSuccess: 85, verdict: "reject", onlyTooEasy: true }), "easy"],
    ["lehčí podle skóre obtížnosti", v({ scores: { difficulty: 5 } }), "easy"],
    ["lehká se zkratkou", v({ predictedSuccess: 85, shortcut: true, onlyTooEasy: true, verdict: "reject" }), "reject"],
    ["triviální (95 %)", v({ predictedSuccess: 95, onlyTooEasy: true, verdict: "reject" }), "reject"],
    ["jiný klíč", v({ answers: [[key === "A" ? "B" : "A"]], predictedSuccess: 85, onlyTooEasy: true }), "reject"],
    ["chyba v češtině", v({ predictedSuccess: 85, scores: { czech: 6 }, onlyTooEasy: true, verdict: "reject" }), "reject"],
    ["zamítnutá z jiného důvodu", v({ predictedSuccess: 85, verdict: "reject", onlyTooEasy: false }), "reject"],
  ];
  for (const [label, val, want] of cases) {
    const got = judge(one, val).status;
    if (got !== want) failures++;
    console.log(`  ${got === want ? "✓" : "✗"} verdikt „${label}“: ${got}${got === want ? "" : ` (má být ${want})`}`);
  }
}

// 5) Spacing rules: a family member waits FAMILY_GAP_TASKS tasks and FAMILY_GAP_DAYS; at most 1 easy task per 10.
{
  const now = Date.now();
  const served = (n: number, o: Partial<Served> = {}): Served[] =>
    Array.from({ length: n }, (_, i) => ({ id: `t${i}`, at: new Date(now - i * 3600_000).toISOString(), family: `t${i}`, easy: false, focus: focusOf("slovni", {}), ...o }));
  const old = new Date(now - (FAMILY_GAP_DAYS + 1) * 86_400_000).toISOString();
  const withMember = (pos: number, at: string) => served(FAMILY_GAP_TASKS + 5).map((s, i) => (i === pos ? { ...s, family: "F", at } : s));
  const checks: [string, boolean, boolean][] = [
    ["člen rodiny hned po sobě", familyAllowed("F", withMember(0, new Date(now).toISOString()), now), false],
    ["člen rodiny před 3 úlohami, starý", familyAllowed("F", withMember(3, old), now), false],
    [`člen rodiny před ${FAMILY_GAP_TASKS} úlohami, ale včera`, familyAllowed("F", withMember(FAMILY_GAP_TASKS, new Date(now - 86_400_000).toISOString()), now), false],
    [`člen rodiny před ${FAMILY_GAP_TASKS} úlohami a ${FAMILY_GAP_DAYS + 1} dny`, familyAllowed("F", withMember(FAMILY_GAP_TASKS, old), now), true],
    ["rodina, kterou uživatel neviděl", familyAllowed("F", served(30), now), true],
    ["další lehká 5 úloh po lehké", !easyRecently(served(12).map((s, i) => (i === 4 ? { ...s, easy: true } : s))), false],
    ["další lehká 10 úloh po lehké", !easyRecently(served(12).map((s, i) => (i === 9 ? { ...s, easy: true } : s))), true],
  ];
  for (const [label, got, want] of checks) {
    if (got !== want) failures++;
    console.log(`  ${got === want ? "✓" : "✗"} rozestup: ${label} → ${got ? "smí" : "počká"}`);
  }
}

// 6) Repetition: principles that most tasks of a type share ("pokud…, pak…", "pořadí") are not a repetition,
//    the same specific topic is.
{
  const word = (i: number, salt: string) => `${salt}${"abcdefghij"[i % 10]}${"klmnoprstu"[Math.floor(i / 10) % 10]}ová`;
  const pool = Array.from({ length: 20 }, (_, i) =>
    focusOf("podminky", { topic: `Pořadí ${word(i, "vystup")} ${word(i, "hosté")}`, focus: ["podmíněná podmínka „pokud…, pak…“", "skrytý důsledek podmínek"] }),
  );
  const fresh = focusOf("podminky", { topic: "Pořadí přednášek na konferenci", focus: ["podmíněná podmínka „pokud…, pak…“", "skrytý důsledek"] });
  const same = focusOf("podminky", { topic: `Pořadí ${word(3, "vystup")} ${word(3, "hosté")}`, focus: ["podmíněná podmínka „pokud…, pak…“", "skrytý důsledek"] });
  const cases: [string, string, boolean][] = [
    ["stejné principy, jiné téma", repetitionIssue("podminky", fresh, pool, []), false],
    ["stejné téma jako úloha v zásobě", repetitionIssue("podminky", same, pool, []), true],
  ];
  for (const [label, issue, want] of cases) {
    const got = Boolean(issue);
    if (got !== want) failures++;
    console.log(`  ${got === want ? "✓" : "✗"} opakování: ${label} → ${got ? "zamítnuto" : "projde"}`);
  }
}

console.log(`\nCelkem problémů: ${failures}`);
process.exit(failures ? 1 : 0);
