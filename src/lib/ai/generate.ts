import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { taskTypeMeta } from "@/lib/content/exams";
import { groupsOfType } from "@/lib/content/load";
import type { ChartSpec, ExamId, Group, OptionKey, Question, TaskType } from "@/lib/content/types";
import { AI } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { anthropic } from "./client";
import { taskToPrompt } from "./format";
import { getLessons, lessonsBlock, refreshLessons, type Lessons } from "./lessons";
import { logAiCall } from "./usage";
import { type Focus, focusOf, poolFocuses, repetitionIssue, steering, varietyBlock } from "./variety";
import { after } from "next/server";

// ------------------------------------------------------------------ schemas

const OptionSchema = z.object({ key: z.string(), text: z.string() });
const PartSchema = z.object({
  label: z.enum(["synonymum", "antonymum"]).nullable(),
  options: z.array(OptionSchema),
  answer: z.string(),
});
const ChartSchema = z.object({
  kind: z.enum(["bar", "stacked", "line", "pie"]),
  title: z.string().nullable(),
  xLabel: z.string().nullable(),
  yLabel: z.string().nullable(),
  unit: z.string().nullable(),
  yStep: z.number().nullable().describe("Krok mřížky osy y (bar/stacked/line). Každá hodnota musí být jeho násobkem."),
  categories: z.array(z.string()),
  series: z.array(z.object({ name: z.string(), values: z.array(z.number()) })),
});

const GeneratedSchema = z.object({
  topic: z.string().describe("Krátké téma úlohy (3–6 slov), slouží k hlídání opakování."),
  focus: z
    .array(z.string())
    .describe(
      "1–3 klíčové pojmy, na kterých úloha stojí (slouží k hlídání opakování): u synonym podtržené slovo v základním tvaru, " +
        "u analogií vztah (např. „nástroj – činnost“), u textů hlavní pojem tématu, u matematiky použitý princip nebo chyták " +
        "(např. „řetězení procentních změn“, „záporná báze mocniny“).",
    ),
  instruction: z.string(),
  passageTitle: z.string().nullable(),
  passage: z.string().nullable(),
  chart: ChartSchema.nullable().describe("Jen u úloh s grafem, jinak null."),
  questions: z.array(
    z.object({
      stem: z.string(),
      compare: z.object({ left: z.string(), right: z.string() }).nullable(),
      parts: z.array(PartSchema),
      solution: z.string(),
      trapDesign: z
        .string()
        .describe("Interní: ke každé špatné možnosti napiš, jakou konkrétní chybu nebo past představuje a proč je lákavá."),
    }),
  ),
});
type Generated = z.infer<typeof GeneratedSchema>;

const ValidationSchema = z.object({
  answers: z
    .array(z.array(z.string()))
    .describe(
      "Tvoje vlastní řešení: pro každou úlohu pole písmen, JEDNO PÍSMENO NA KAŽDOU ČÁST. " +
        "Synonyma/antonyma mají 2 části → 2 písmena, např. [[\"C\", \"F\"]]. Ostatní úlohy 1 písmeno, např. [[\"B\"]].",
    ),
  reasoning: z.string().describe("Stručně, jak jsi úlohy vyřešil(a)."),
  predictedSuccess: z
    .number()
    .describe("Odhad: kolik % průměrných uchazečů o VŠ by úlohu vyřešilo správně (reálné úlohy Scio OSP mají typicky 30–60 %)."),
  shortcut: z
    .boolean()
    .describe("true, pokud jde správnou odpověď najít povrchním trikem bez skutečného řešení (jediná gramaticky sedící, nejdelší/nejkonkrétnější možnost, zjevně nesmyslné distraktory, odpověď je přímo opsaná z textu)."),
  scores: z.object({
    distractors: z.number().describe("1–10: síla chytáků – jsou špatné možnosti věrohodné a odpovídají typickým chybám?"),
    unambiguous: z.number().describe("1–10: má každá část právě jednu obhajitelnou správnou odpověď?"),
    czech: z.number().describe("1–10: gramatická a stylistická správnost češtiny, smysluplnost vět."),
    real_words: z.number().describe("1–10: existují všechna slova a platí uvedené významové vztahy (synonyma/antonyma/analogie)?"),
    scio_style: z.number().describe("1–10: odpovídá styl a formát skutečným úlohám Scio OSP?"),
    difficulty: z.number().describe("1–10: odpovídá obtížnost reálnému testu Scio (10 = přesně jako Scio, ≤6 = výrazně lehčí)?"),
  }),
  issues: z.array(z.string()).describe("Konkrétní problémy; prázdné pole, pokud žádné."),
  verdict: z.enum(["accept", "reject"]),
});
export type Validation = z.infer<typeof ValidationSchema>;

/** Bump when generation/validation rules get stricter – older pool tasks are no longer served. */
export const GENERATOR_VERSION = 2;

// ------------------------------------------------------------------ canonical option texts

const COMPARE_OPTIONS = [
  "Hodnota vlevo je větší než hodnota vpravo.",
  "Hodnota vpravo je větší než hodnota vlevo.",
  "Hodnota vpravo je stejná jako hodnota vlevo.",
  "Nelze jednoznačně určit, která hodnota je větší.",
];
const SUFFICIENCY_OPTIONS = [
  "Každé z tvrzení je samo o sobě dostačující.",
  "Právě jedno z tvrzení je samo o sobě dostačující.",
  "Obě tvrzení dohromady jsou dostačující, ale ani jedno z tvrzení není samo o sobě dostačující.",
  "Ani obě tvrzení dohromady nejsou dostačující.",
];

// ------------------------------------------------------------------ prompts

const GENERATOR_SYSTEM = `Jsi autor úloh pro test Obecných studijních předpokladů (OSP) společnosti Scio.
Tvoříš NOVÉ úlohy, které jsou k nerozeznání od skutečných úloh Scio: stejný formát, styl, délka, obtížnost a pravidla.

OBTÍŽNOST JE KLÍČOVÁ. Reálné testy OSP mají průměrnou úspěšnost kolem 45–55 % – úlohy jsou zrádné, ne lehké.
Cíl: úlohu správně vyřeší 30–60 % průměrných uchazečů o VŠ. Proto:
- Každá úloha obsahuje aspoň jeden promyšlený chyták. Nejlákavější distraktor musí na první pohled vypadat správně
  a odhalí ho až pečlivé čtení nebo výpočet.
- Každá špatná možnost odpovídá konkrétní typické chybě (popiš ji v trapDesign). Žádný distraktor nesmí být zjevný nesmysl.
- Odpověď nesmí jít uhodnout povrchně (nejdelší možnost, jediná gramaticky sedící, opsaná věta z textu, „střední“ číslo).
- Žádné „školní“ jednokrokové příklady – matematika má 2–3 kroky, verbální úlohy vyžadují přesné porozumění.

Zásady:
- Drž se přesně pravidel typu úlohy a vzorů. Vzory NIKDY nekopíruj ani nepřeformulovávej – vymysli jiné téma,
  jiná slova, jiná čísla a jiný kontext. Obměňuj dostatečně (jiná oblast života, vědy, historie, techniky…).
- Čeština musí být bezchybná, přirozená a spisovná; věty musí dávat smysl. Používej české uvozovky „…“ a pomlčku –.
- Každá část má právě jednu správnou odpověď, kterou lze jednoznačně obhájit. Distraktory musí být věrohodné
  (odpovídat typickým chybám), ale prokazatelně špatné.
- U synonym/antonym/analogií používej jen skutečná existující česká slova a ověřené významové vztahy.
- Matematiku ověř výpočtem. Čísla volit tak, aby úloha šla spočítat na papíře bez kalkulačky.
- Logické úlohy (podmínky) ověř úplným výčtem všech možností.
- Správné odpovědi rozlož mezi A–D náhodně (ne vždy stejné písmeno).
- Formát textu: Markdown; podtržení <u>slovo</u>; prázdné místo ______; matematika KaTeX $...$ (desetinná čárka $4{,}5$);
  tabulky jako GFM Markdown tabulka. Výroky 1) 2) 3) dávej na samostatné řádky oddělené prázdným řádkem.
- Klíče možností: A, B, C, D (u antonym E, F, G, H). U úloh bez sdíleného textu dej passage = null.
- solution: 1–4 věty česky, proč je odpověď správná (u matematiky stručný výpočet).`;

const VALIDATOR_SYSTEM = `Jsi přísný recenzent úloh pro test OSP (Scio). Dostaneš úlohu BEZ klíče.
1) Vyřeš ji sám, pečlivě a nezávisle (matematiku přepočítej, logiku ověř výčtem, u textů vycházej jen z textu).
2) Posuď kvalitu: jednoznačnost, gramatiku a smysluplnost češtiny, existenci slov a správnost významových vztahů,
   shodu se stylem Scio, sílu chytáků a obtížnost.
3) Posuď obtížnost realisticky VŮČI PŘILOŽENÝM SKUTEČNÝM ÚLOHÁM SCIO stejného typu – ty jsou měřítkem.
   Úloha má být srovnatelně náročná jako ony, NE těžší. Reálné úlohy OSP mají úspěšnost zhruba 30–75 %.
   Úloha, kterou by vyřešilo přes 75 % uchazečů, je příliš lehká. Hledej zkratky: jde odpověď najít bez skutečného
   řešení? Jsou distraktory jen „vata“? Je chyták srovnatelně zrádný jako u skutečných úloh?
Do answers uveď u každé úlohy jedno písmeno za KAŽDOU část (synonyma/antonyma = 2 písmena).
Všechny texty (reasoning, issues) piš česky.
verdict = "reject", pokud má úloha víc obhajitelných odpovědí, žádnou správnou odpověď, chybu v češtině,
neexistující slovo, nesmyslný vztah, chybu ve výpočtu, je zjevně mimo styl Scio, nebo je příliš lehká / bez chytáku.`;

function pickExamples(exam: ExamId, type: TaskType, count: number) {
  const pool = groupsOfType(exam, type).filter(
    (g) => !g.group.figure && !g.group.questions.some((q) => q.figure || q.excluded || q.parts.some((p) => p.alsoAccepted)),
  );
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/** For data tasks: keep charts and tables 50/50 in the pool. */
async function preferChart(exam: ExamId) {
  const { data } = await createAdminClient()
    .from("generated_tasks")
    .select("payload")
    .eq("exam", exam)
    .eq("task_type", "data")
    .order("created_at", { ascending: false })
    .limit(40);
  const rows = (data ?? []).map((r) => Boolean((r.payload as Group).chart));
  const charts = rows.filter(Boolean).length;
  return charts <= rows.length - charts;
}

const CHART_KINDS = ["bar", "line", "stacked", "pie"] as const;

// ------------------------------------------------------------------ checks

function toGroup(gen: Generated, type: TaskType): Group {
  const meta = taskTypeMeta(type);
  const fixed = type === "porovnani" ? COMPARE_OPTIONS : type === "dostatecnost" ? SUFFICIENCY_OPTIONS : null;
  const questions: Question[] = gen.questions.map((q, i) => ({
    n: i + 1,
    stem: q.stem.trim(),
    ...(q.compare ? { compare: { left: q.compare.left.trim(), right: q.compare.right.trim() } } : {}),
    parts: q.parts.map((p) => ({
      ...(p.label ? { label: p.label } : {}),
      options: p.options.map((o, oi) => ({
        key: o.key.trim().toUpperCase() as OptionKey,
        text: fixed ? fixed[oi] ?? o.text.trim() : o.text.trim(),
      })),
      answer: p.answer.trim().toUpperCase().replace(/[()]/g, "") as OptionKey,
    })),
    solution: q.solution.trim(),
  }));
  return {
    id: "g01",
    taskType: type,
    instruction: gen.instruction.trim() || meta?.description || "",
    ...(gen.passage?.trim() ? { passage: gen.passage.trim() } : {}),
    ...(gen.passageTitle?.trim() ? { passageTitle: gen.passageTitle.trim() } : {}),
    ...(gen.chart ? { chart: cleanChart(gen.chart) } : {}),
    questions,
  };
}

function cleanChart(c: z.infer<typeof ChartSchema>): ChartSpec {
  return {
    kind: c.kind,
    ...(c.title?.trim() ? { title: c.title.trim() } : {}),
    ...(c.xLabel?.trim() ? { xLabel: c.xLabel.trim() } : {}),
    ...(c.yLabel?.trim() ? { yLabel: c.yLabel.trim() } : {}),
    ...(c.unit?.trim() ? { unit: c.unit.trim() } : {}),
    ...(c.kind !== "pie" && c.yStep ? { yStep: c.yStep } : {}),
    categories: c.categories.map((x) => x.trim()),
    series: c.series.map((s) => ({ name: s.name.trim(), values: s.values })),
  };
}

/** Problems with a chart's data (empty = OK). */
export function chartIssues(c: ChartSpec): string[] {
  const issues: string[] = [];
  const n = c.categories.length;
  if (n < 2 || n > 8) issues.push("graf: 2–8 kategorií");
  if (!c.series.length || c.series.length > 4) issues.push("graf: 1–4 řady");
  for (const s of c.series) {
    if (s.values.length !== n) issues.push(`graf: řada ${s.name} nemá ${n} hodnot`);
    if (s.values.some((v) => !Number.isFinite(v) || v < 0)) issues.push(`graf: řada ${s.name} má neplatné hodnoty`);
  }
  if (c.kind === "pie") {
    if (c.series.length !== 1) issues.push("koláč: právě 1 řada");
    if (n > 6) issues.push("koláč: max. 6 výsečí");
  } else {
    const step = c.yStep ?? 0;
    if (!(step > 0)) issues.push("graf: chybí yStep");
    else {
      const max = c.kind === "stacked"
        ? Math.max(...c.categories.map((_, i) => c.series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0)))
        : Math.max(...c.series.flatMap((s) => s.values));
      if (max / step > 14) issues.push("graf: příliš husté dělení osy");
      const off = c.series.some((s) => s.values.some((v) => Math.abs(v / step - Math.round(v / step)) > 1e-9));
      if (off) issues.push("graf: hodnoty neleží na mřížce (násobky yStep)");
    }
  }
  return issues;
}

/** Deterministic structural checks. Returns a list of problems (empty = OK). */
export function structuralIssues(group: Group, type: TaskType): string[] {
  const issues: string[] = [];
  const meta = taskTypeMeta(type);
  if (!group.questions.length) issues.push("žádné úlohy");
  if (meta && meta.groupSize > 1 && group.questions.length < 2) issues.push("málo úloh ve skupině");
  if (meta && meta.groupSize > 1 && !group.passage && !group.chart) issues.push("chybí společný text");
  if (group.chart) issues.push(...chartIssues(group.chart));
  if (type === "data" && !group.chart && !/\|.*\|/.test(group.passage ?? "")) issues.push("chybí tabulka nebo graf");
  for (const q of group.questions) {
    if (!q.stem && !q.compare) issues.push(`úloha ${q.n}: prázdné zadání`);
    if (type === "porovnani" && !q.compare) issues.push(`úloha ${q.n}: chybí výrazy vlevo/vpravo`);
    const expectedParts = type === "synonyma" ? 2 : 1;
    if (q.parts.length !== expectedParts) issues.push(`úloha ${q.n}: počet částí ${q.parts.length}`);
    q.parts.forEach((p, pi) => {
      const keys = type === "synonyma" && pi === 1 ? ["E", "F", "G", "H"] : ["A", "B", "C", "D"];
      if (p.options.map((o) => o.key).join("") !== keys.join("")) issues.push(`úloha ${q.n}: klíče možností`);
      if (!keys.includes(p.answer)) issues.push(`úloha ${q.n}: odpověď mimo možnosti`);
      const texts = p.options.map((o) => o.text.toLowerCase());
      if (new Set(texts).size !== texts.length) issues.push(`úloha ${q.n}: duplicitní možnosti`);
      if (p.options.some((o) => !o.text)) issues.push(`úloha ${q.n}: prázdná možnost`);
    });
    const all = [q.stem, group.passage ?? "", ...q.parts.flatMap((p) => p.options.map((o) => o.text))].join(" ");
    if (((all.replace(/\\\$/g, "").match(/\$/g) ?? []).length) % 2) issues.push(`úloha ${q.n}: nespárované $`);
    if (type === "synonyma" && !/<u>.+<\/u>/.test(q.stem)) issues.push(`úloha ${q.n}: chybí podtržený výraz`);
    if (!q.solution) issues.push(`úloha ${q.n}: chybí zdůvodnění`);
  }
  return issues;
}

async function validate(group: Group, type: TaskType, userId?: string): Promise<Validation> {
  const meta = taskTypeMeta(type);
  // real Scio tasks of the same type anchor the difficulty judgement (keys included – they're reference only)
  const reference = pickExamples("osp", type, meta && meta.groupSize > 1 ? 1 : 2)
    .map((e, i) => `### Skutečná úloha Scio ${i + 1} (měřítko obtížnosti)\n${taskToPrompt(e.group)}`)
    .join("\n\n");
  const response = await anthropic().messages.parse({
    model: AI.validatorModel,
    max_tokens: 16000,
    output_config: { effort: AI.validatorEffort, format: zodOutputFormat(ValidationSchema) },
    system: [{ type: "text", text: VALIDATOR_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          // per-type prefix, shared by every validation of this type in a generation batch
          {
            type: "text",
            text: `Typ úlohy: ${meta?.name}\nPravidla typu: ${meta?.rules}\nTypické chytáky Scio u tohoto typu: ${meta?.traps}`,
            cache_control: { type: "ephemeral" },
          },
          { type: "text", text: `${reference}\n\n### POSUZOVANÁ ÚLOHA (bez klíče)\n${taskToPrompt(group, group.questions, false)}` },
        ],
      },
    ],
  });
  await logAiCall({ userId, kind: "validate", model: AI.validatorModel, usage: response.usage, ok: Boolean(response.parsed_output) });
  if (!response.parsed_output) throw new Error(`Validator parse failed (${response.stop_reason})`);
  return response.parsed_output;
}

/** Validator letters for one question, one per part. Tolerates "C/F", "C, F" or "(C)" in a single string. */
function validatorLetters(v: Validation, qi: number) {
  return (v.answers[qi] ?? []).flatMap((a) => a.toUpperCase().match(/[A-H]/g) ?? []);
}

function accepts(group: Group, v: Validation) {
  // Validators sometimes list each part as its own entry ([["D"],["G"]] instead of [["D","G"]]):
  // when the total number of letters matches the number of parts, compare them in order.
  const key = group.questions.flatMap((q) => q.parts.map((p) => p.answer));
  const all = v.answers.flatMap((a) => a.flatMap((x) => x.toUpperCase().match(/[A-H]/g) ?? []));
  const keyMatches =
    all.length === key.length
      ? key.every((k, i) => all[i] === k)
      : group.questions.every((q, qi) => {
          const letters = validatorLetters(v, qi);
          return q.parts.every((p, pi) => letters[pi] === p.answer);
        });
  const s = v.scores;
  // correctness bars stay strict; style/difficulty bars match real Scio tasks (not "harder than Scio")
  const scoresOk =
    [s.unambiguous, s.czech, s.real_words].every((x) => x >= 8) &&
    s.scio_style >= 7 &&
    [s.difficulty, s.distractors].every((x) => x >= 6);
  const hardEnough = !v.shortcut && v.predictedSuccess >= 20 && v.predictedSuccess <= 75;
  return { ok: keyMatches && scoresOk && hardEnough && v.verdict === "accept", keyMatches, hardEnough };
}

/** The validator's acceptance bar, given to the generator so it can self-check before answering. */
const ACCEPTANCE_CRITERIA = `KRITÉRIA, PODLE KTERÝCH ÚLOHU NEZÁVISLE OHODNOTÍ VALIDÁTOR (musí projít všechna):
- validátor úlohu vyřeší sám a musí dojít k TVÉMU klíči – každá část má právě jednu obhajitelnou odpověď;
- čeština bez chyb, všechna slova existují, významové vztahy platí (≥ 8/10);
- styl Scio ≥ 7/10, obtížnost a síla chytáků ≥ 6/10 – srovnatelné se skutečnými úlohami Scio daného typu;
- odhad úspěšnosti uchazečů 20–75 % (ne lehčí, ne nesmyslně těžká), žádná povrchní zkratka k odpovědi;
- u synonym/antonym přesně 2 části (synonymum A–D, antonymum E–H).
Než odpovíš, úlohu si sám vyřeš od nuly, jako bys klíč neznal, a zkontroluj každé kritérium. Najdeš-li problém, oprav ho.`;

function rejectionText(group: Group, verdict: ReturnType<typeof accepts>, v: Validation) {
  const parts: string[] = [];
  if (!verdict.keyMatches) {
    const all = v.answers.flatMap((a) => a.flatMap((x) => x.toUpperCase().match(/[A-H]/g) ?? [])).join("/");
    const theirs = [`validátor ${all || "?"}, klíč ${group.questions.flatMap((q) => q.parts.map((p) => p.answer)).join("/")}`];
    parts.push(`jiná odpověď než klíč (${theirs.join("; ")})`);
  }
  if (!verdict.hardEnough) parts.push(`příliš lehká nebo se zkratkou (odhad úspěšnosti ${v.predictedSuccess} %, zkratka ${v.shortcut})`);
  if (v.issues.length) parts.push(v.issues.join("; "));
  const s = v.scores;
  const low = Object.entries(s).filter(([k, x]) => x < (["unambiguous", "czech", "real_words"].includes(k) ? 8 : k === "scio_style" ? 7 : 6));
  if (low.length) parts.push(`nízké skóre: ${low.map(([k, x]) => `${k} ${x}`).join(", ")}`);
  return parts.join(" | ");
}

function dataFormatInstruction(useChart: boolean, kind: (typeof CHART_KINDS)[number]) {
  if (!useChart)
    return "Data zadej jako Markdown TABULKU v poli passage (pod krátký popis situace). Pole chart = null.";
  const names = { bar: "sloupcový (bar)", line: "spojnicový (line)", stacked: "skládaný sloupcový (stacked)", pie: "koláčový (pie)" };
  return `Data zadej jako GRAF v poli chart, typ ${names[kind]}. passage obsahuje jen krátký popis situace (bez tabulky a bez opakování hodnot).
Pravidla grafu: 2–8 kategorií, 1–4 řady (koláč: 1 řada, max. 6 výsečí, hodnoty v procentech se součtem 100).
U sloupcového/spojnicového/skládaného grafu zvol yStep (např. 1, 2, 5, 10, 20, 50, 100) a VŠECHNY hodnoty musí být násobky yStep,
aby šly přesně odečíst z mřížky; maximum osy max. 14 kroků. Vyplň xLabel, yLabel a unit. Otázky se ptají na čtení a výpočty z grafu.`;
}

// ------------------------------------------------------------------ public API

export interface GenerationOutcome {
  accepted: { id: string; group: Group; validation: Validation }[];
  rejected: { reason: string }[];
}

/**
 * Generates `count` candidate groups of a task type, checks them structurally and with an independent AI validator,
 * and stores the accepted ones in the shared pool.
 */
export async function generateTasks(opts: {
  exam: ExamId;
  type: TaskType;
  count: number;
  userId?: string;
  /** Generate + validate only, don't touch the database (quality testing). */
  dryRun?: boolean;
  /** Epoch ms by which the work must finish (serverless time limit). Revisions are skipped when time runs short. */
  deadline?: number;
}): Promise<GenerationOutcome> {
  const { exam, type, count, userId, dryRun, deadline } = opts;
  // a revision round = generate + validate again ≈ up to 2.5 min
  const timeForRevision = () => !deadline || Date.now() + 150_000 < deadline;
  const meta = taskTypeMeta(type);
  if (!meta) throw new Error(`Neznámý typ úlohy ${type}`);
  const pool: Focus[] = dryRun ? [] : (await poolFocuses(exam, type)).map((p) => p.focus);
  const steer = steering(type, count);
  const siblings: Focus[] = []; // accepted-so-far candidates of this batch (they run in parallel)
  const chartFirst = type === "data" ? (dryRun ? Math.random() < 0.5 : await preferChart(exam)) : false;

  const lessons: Lessons | null = dryRun ? null : await getLessons(type).catch(() => null);

  const jobs = Array.from({ length: count }, async (_, i) => {
    const examples = pickExamples(exam, type, meta.groupSize > 1 ? 2 : 4);
    const examplesText = examples
      .map((e, ei) => `### Vzor ${ei + 1} (${e.test.title})\n${taskToPrompt(e.group)}`)
      .join("\n\n");
    const prompt = `Vytvoř 1 novou úlohu typu „${meta.name}“ (${meta.description}).
${meta.groupSize > 1 ? `Úloha je skupina ${meta.groupSize} otázek ke společnému textu/datům (passage).` : "Úloha obsahuje 1 otázku."}

Pravidla typu:
${meta.rules}

Chytáky typické pro tento typ (zabuduj je):
${meta.traps}
${lessonsBlock(lessons)}
Skutečné úlohy Scio jako vzor (styl, délka, obtížnost – NEKOPÍROVAT):
${examplesText}

${varietyBlock(type, pool)}
Variace č. ${i + 1}: zasaď úlohu do oblasti „${steer[i].domain}“ (jiné než vzory)${steer[i].wordClass ? `; podtržený výraz ať je ${steer[i].wordClass}` : ""}${i % 2 ? " a zvol mírně vyšší obtížnost" : ""}.
${type === "data" ? dataFormatInstruction(i % 2 === 0 ? chartFirst : !chartFirst, CHART_KINDS[Math.floor(Math.random() * CHART_KINDS.length)]) : "Pole chart nastav na null."}

${ACCEPTANCE_CRITERIA}`;

    const logReject = (reason: string) =>
      dryRun ? Promise.resolve() : logAiCall({ userId, kind: "reject", model: AI.model, note: `${type}: ${reason}`.slice(0, 1000) });

    try {
      // attempt 0 = fresh task, attempt 1 = the same task revised with the validator's feedback
      // breakpoint on the original prompt: the revision resends it and reads it from cache instead of paying full price
      const conversation: Anthropic.MessageParam[] = [
        { role: "user", content: [{ type: "text", text: prompt, cache_control: { type: "ephemeral" } }] },
      ];
      let lastReason = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await anthropic().messages.parse({
          model: AI.model,
          max_tokens: 20000, // non-streaming requests must stay under the SDK's 10-minute ceiling (~21k)
          output_config: { effort: AI.generatorEffort, format: zodOutputFormat(GeneratedSchema) },
          system: [{ type: "text", text: GENERATOR_SYSTEM, cache_control: { type: "ephemeral" } }],
          messages: conversation,
        });
        const gen = response.parsed_output;
        if (!dryRun) await logAiCall({ userId, kind: "generate", model: AI.model, usage: response.usage, ok: Boolean(gen) });
        if (!gen) {
          lastReason = `generátor nevrátil platný JSON (${response.stop_reason})`;
          await logReject(lastReason);
          break;
        }
        const group = toGroup(gen, type);
        const issues = structuralIssues(group, type);
        const focus = focusOf(type, { topic: gen.topic, focus: gen.focus, stem: group.questions[0]?.stem });
        // fresh pool: other workers may have stored a task with the same word since this batch started
        const repetition = dryRun ? "" : repetitionIssue(type, focus, (await poolFocuses(exam, type)).map((p) => p.focus), siblings);
        let problem = "";
        let validation: Validation | null = null;
        if (issues.length) {
          problem = `struktura: ${issues.join("; ")}`;
        } else if (repetition) {
          problem = repetition;
        } else {
          validation = await validate(group, type, dryRun ? undefined : userId);
          const verdict = accepts(group, validation);
          if (!verdict.ok) problem = `validátor: ${rejectionText(group, verdict, validation)}`;
        }

        // a parallel candidate of this batch may have taken the same word while this one was being validated
        if (!problem && validation) problem = repetitionIssue(type, focus, [], siblings);
        if (!problem && validation) {
          siblings.push(focus);
          const s = validation.scores;
          const quality = (s.unambiguous + s.czech + s.real_words + s.scio_style + s.difficulty + s.distractors) / 6;
          if (dryRun) return { accepted: { id: "dry-run", group: { ...group, topic: gen.topic, focus: gen.focus } as Group, validation } };
          const { data, error } = await createAdminClient()
            .from("generated_tasks")
            .insert({
              exam,
              task_type: type,
              payload: {
                ...group,
                topic: gen.topic,
                focus: gen.focus,
                v: GENERATOR_VERSION,
                trapDesign: gen.questions.map((q) => q.trapDesign),
              },
              quality,
              validator: validation,
              model: AI.model,
              seed_refs: examples.map((e) => `${e.test.id}:${e.group.id}`),
              created_by: userId ?? null,
            })
            .select("id")
            .single();
          if (error) return { rejected: `db: ${error.message}` };
          await logAiCall({ userId, kind: "accept", model: AI.model, note: `${type}: ${attempt ? "revised" : "first"}` });
          return { accepted: { id: data.id as string, group, validation } };
        }

        // remember why it failed (the generator learns from this) and give it one chance to fix it
        lastReason = attempt ? `[po opravě] ${problem}` : problem;
        await logReject(lastReason);
        if (attempt === 0 && !timeForRevision()) {
          lastReason = `${problem} [bez opravy – došel čas]`;
          break;
        }
        if (attempt === 0) {
          conversation.push(
            { role: "assistant", content: JSON.stringify(gen) },
            {
              role: "user",
              content: `Úlohu kontrola ZAMÍTLA. Důvod: ${problem}
${validation ? `Validátorovo řešení: ${validation.reasoning.slice(0, 1500)}` : ""}

Oprav úlohu tak, aby všechny výtky zmizely a prošla kritérii. Pokud měl validátor u klíče pravdu, oprav klíč;
pokud ne, uprav zadání nebo možnosti tak, aby byla odpověď jednoznačná. Je-li úloha příliš lehká, přidej
skutečný chyták a zvyš obtížnost. Vrať celou opravenou úlohu ve stejném formátu.`,
            },
          );
        }
      }
      return { rejected: lastReason || "neznámý důvod" };
    } catch (err) {
      console.error("generateTasks", err);
      const reason = err instanceof Error ? err.message : "chyba";
      await logReject(`chyba: ${reason}`);
      return { rejected: reason };
    }
  });

  const results = await Promise.all(jobs);
  if (!dryRun && results.some((r) => "rejected" in r)) {
    // distill new lessons from the latest rejections (after the response when possible)
    const learn = () => refreshLessons(type).catch((e) => console.error("refreshLessons", e));
    try {
      after(learn);
    } catch {
      await learn();
    }
  }
  const outcome: GenerationOutcome = { accepted: [], rejected: [] };
  for (const r of results) {
    if ("accepted" in r && r.accepted) outcome.accepted.push(r.accepted);
    else if ("rejected" in r) outcome.rejected.push({ reason: r.rejected as string });
  }
  if (outcome.rejected.length) console.warn(`generateTasks ${type}: rejected`, outcome.rejected);
  return outcome;
}
