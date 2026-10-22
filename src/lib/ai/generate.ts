import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { taskTypeMeta } from "@/lib/content/exams";
import { groupsOfType } from "@/lib/content/load";
import type { ChartSpec, ExamId, Group, OptionKey, Question, TaskType } from "@/lib/content/types";
import { AI } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { anthropic } from "./client";
import { taskToPrompt } from "./format";
import { logAiCall } from "./usage";

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
    .describe("Tvoje vlastní řešení: pro každou úlohu pole písmen (jedno na každou část)."),
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
3) Posuď obtížnost realisticky: reálné úlohy OSP mají úspěšnost typicky 30–60 %. Úloha, kterou by vyřešilo přes 70 %
   uchazečů, je pro tuto databázi PŘÍLIŠ LEHKÁ. Hledej zkratky: jde odpověď najít bez skutečného řešení?
   Jsou distraktory jen „vata“? Je chyták dost zrádný?
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

async function recentTopics(exam: ExamId, type: TaskType) {
  const { data } = await createAdminClient()
    .from("generated_tasks")
    .select("payload")
    .eq("exam", exam)
    .eq("task_type", type)
    .order("created_at", { ascending: false })
    .limit(40);
  return (data ?? []).map((r) => (r.payload as { topic?: string }).topic).filter(Boolean) as string[];
}

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
  const response = await anthropic().messages.parse({
    model: AI.validatorModel,
    max_tokens: 16000,
    output_config: { effort: "high", format: zodOutputFormat(ValidationSchema) },
    system: VALIDATOR_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Typ úlohy: ${meta?.name}\nPravidla typu: ${meta?.rules}\nTypické chytáky Scio u tohoto typu: ${meta?.traps}\n\n${taskToPrompt(group, group.questions, false)}`,
      },
    ],
  });
  await logAiCall({ userId, kind: "validate", model: AI.validatorModel, usage: response.usage, ok: Boolean(response.parsed_output) });
  if (!response.parsed_output) throw new Error(`Validator parse failed (${response.stop_reason})`);
  return response.parsed_output;
}

function accepts(group: Group, v: Validation) {
  const keyMatches = group.questions.every((q, qi) =>
    q.parts.every((p, pi) => (v.answers[qi]?.[pi] ?? "").trim().toUpperCase().replace(/[()]/g, "") === p.answer),
  );
  const s = v.scores;
  const scoresOk =
    [s.unambiguous, s.czech, s.real_words].every((x) => x >= 8) &&
    [s.scio_style, s.difficulty, s.distractors].every((x) => x >= 7);
  const hardEnough = !v.shortcut && v.predictedSuccess >= 20 && v.predictedSuccess <= 70;
  return { ok: keyMatches && scoresOk && hardEnough && v.verdict === "accept", keyMatches, hardEnough };
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
}): Promise<GenerationOutcome> {
  const { exam, type, count, userId, dryRun } = opts;
  const meta = taskTypeMeta(type);
  if (!meta) throw new Error(`Neznámý typ úlohy ${type}`);
  const topics = dryRun ? [] : await recentTopics(exam, type);
  const chartFirst = type === "data" ? (dryRun ? Math.random() < 0.5 : await preferChart(exam)) : false;

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

Skutečné úlohy Scio jako vzor (styl, délka, obtížnost – NEKOPÍROVAT):
${examplesText}

${topics.length ? `Témata, která už v databázi jsou (vyhni se jim):\n- ${topics.slice(0, 30).join("\n- ")}\n` : ""}
Variace č. ${i + 1}: zvol téma z jiné oblasti než vzory${i % 2 ? " a mírně vyšší obtížnost" : ""}.
${type === "data" ? dataFormatInstruction(i % 2 === 0 ? chartFirst : !chartFirst, CHART_KINDS[Math.floor(Math.random() * CHART_KINDS.length)]) : "Pole chart nastav na null."}`;

    try {
      const response = await anthropic().messages.parse({
        model: AI.model,
        max_tokens: 24000,
        output_config: { effort: "high", format: zodOutputFormat(GeneratedSchema) },
        system: GENERATOR_SYSTEM,
        messages: [{ role: "user", content: prompt }],
      });
      const gen = response.parsed_output;
      if (!dryRun) await logAiCall({ userId, kind: "generate", model: AI.model, usage: response.usage, ok: Boolean(gen) });
      if (!gen) return { rejected: `generátor nevrátil platný JSON (${response.stop_reason})` };
      const group = toGroup(gen, type);
      const issues = structuralIssues(group, type);
      if (issues.length) return { rejected: `struktura: ${issues.join("; ")}` };

      const validation = await validate(group, type, dryRun ? undefined : userId);
      const verdict = accepts(group, validation);
      if (!verdict.ok) {
        return {
          rejected: `validátor: ${verdict.keyMatches ? "" : "jiná odpověď než klíč; "}${verdict.hardEnough ? "" : `příliš lehká (úspěšnost ${validation.predictedSuccess} %, zkratka ${validation.shortcut}); `}${validation.issues.join("; ")} ${JSON.stringify(validation.scores)}`,
        };
      }
      const s = validation.scores;
      const quality = (s.unambiguous + s.czech + s.real_words + s.scio_style + s.difficulty + s.distractors) / 6;
      if (dryRun) return { accepted: { id: "dry-run", group: { ...group, topic: gen.topic } as Group, validation } };
      const { data, error } = await createAdminClient()
        .from("generated_tasks")
        .insert({
          exam,
          task_type: type,
          payload: {
            ...group,
            topic: gen.topic,
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
      return { accepted: { id: data.id as string, group, validation } };
    } catch (err) {
      console.error("generateTasks", err);
      return { rejected: err instanceof Error ? err.message : "chyba" };
    }
  });

  const results = await Promise.all(jobs);
  const outcome: GenerationOutcome = { accepted: [], rejected: [] };
  for (const r of results) {
    if ("accepted" in r && r.accepted) outcome.accepted.push(r.accepted);
    else if ("rejected" in r) outcome.rejected.push({ reason: r.rejected as string });
  }
  if (outcome.rejected.length) console.warn(`generateTasks ${type}: rejected`, outcome.rejected);
  return outcome;
}
