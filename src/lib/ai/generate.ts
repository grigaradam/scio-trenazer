import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { after } from "next/server";
import { z } from "zod";
import { taskTypeMeta } from "@/lib/content/exams";
import { groupsOfType } from "@/lib/content/load";
import type { ChartSpec, ExamId, Group, OptionKey, Question, QuestionPart, TaskType } from "@/lib/content/types";
import { AI } from "@/lib/env";
import { partCorrect } from "@/lib/scoring";
import { createAdminClient } from "@/lib/supabase/admin";
import { anthropic } from "./client";
import { currentDeck, deckGroups } from "./decks";
import { easyAllowed, type ParentTask } from "./families";
import { taskToPrompt } from "./format";
import { getLessons, lessonsBlock, refreshLessons, type Lessons } from "./lessons";
import { optionShapeIssues } from "./option-shape";
import { costUsd, logAiCall, type AiCallKind, type AiStage } from "./usage";
import { type Focus, type PoolEntry, familyIssue, focusOf, poolFocuses, repetitionIssue, steering, varietyBlock } from "./variety";
import { GENERATOR_VERSION } from "./version";
import { freshWords, needsWords, wordsBlock } from "./words";

export { GENERATOR_VERSION };

// ------------------------------------------------------------------ schemas

const OPTION_KEYS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
const OptionSchema = z.object({ key: z.enum(OPTION_KEYS), text: z.string() });
const PartSchema = z.object({
  label: z.enum(["synonymum", "antonymum"]).nullable(),
  kind: z.enum(["text"]).nullable().describe("\"text\" jen u psané odpovědi (AJ word formation, options = []), jinak null."),
  options: z.array(OptionSchema),
  answer: z.string().describe("Písmeno správné možnosti, u psané odpovědi správné slovo VELKÝMI PÍSMENY."),
  alsoAccepted: z.array(z.string()).nullable().describe("Jen u psané odpovědi: další uznávané tvary (VELKÝMI PÍSMENY), jinak null."),
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
      solution: z.string().describe("Povinné, nikdy prázdné: 1–4 věty, proč je odpověď správná."),
      trapDesign: z
        .string()
        .describe("Interní: ke každé špatné možnosti napiš, jakou konkrétní chybu nebo past představuje a proč je lákavá."),
    }),
  ),
});
export type Generated = z.infer<typeof GeneratedSchema>;

const ValidationSchema = z.object({
  answers: z
    .array(z.array(z.string()))
    .describe(
      "Tvoje vlastní řešení: pro každou úlohu pole písmen, JEDNO PÍSMENO NA KAŽDOU ČÁST. " +
        "Synonyma/antonyma mají 2 části → 2 písmena, např. [[\"C\", \"F\"]]. Ostatní úlohy 1 písmeno, např. [[\"B\"]]. " +
        "U psané odpovědi (word formation) napiš místo písmene celé slovo, např. [[\"UNAWARE\"]].",
    ),
  reasoning: z.string().describe("Stručně, jak jsi úlohy vyřešil(a)."),
  predictedSuccess: z
    .number()
    .describe("Odhad: kolik % průměrných uchazečů o VŠ by úlohu vyřešilo správně (reálné úlohy Scio mají typicky 30–60 %)."),
  shortcut: z
    .boolean()
    .describe("true, pokud jde správnou odpověď najít povrchním trikem bez skutečného řešení (jediná gramaticky sedící, nejdelší/nejkonkrétnější možnost, zjevně nesmyslné distraktory, odpověď je přímo opsaná z textu)."),
  scores: z.object({
    distractors: z.number().describe("1–10: síla chytáků – jsou špatné možnosti věrohodné a odpovídají typickým chybám?"),
    unambiguous: z.number().describe("1–10: má každá část právě jednu obhajitelnou správnou odpověď?"),
    czech: z.number().describe("1–10: gramatická a stylistická správnost jazyka zadání (u OSP čeština, u AJ angličtina), smysluplnost vět."),
    real_words: z.number().describe("1–10: existují všechna slova a platí uvedené významové vztahy (synonyma/antonyma/analogie/odvozeniny)?"),
    scio_style: z.number().describe("1–10: odpovídá styl a formát skutečným úlohám Scio (přiložené vzory)?"),
    difficulty: z.number().describe("1–10: odpovídá obtížnost reálnému testu Scio (10 = přesně jako Scio, ≤6 = výrazně lehčí)?"),
  }),
  issues: z.array(z.string()).describe("Konkrétní problémy; prázdné pole, pokud žádné."),
  onlyTooEasy: z
    .boolean()
    .describe(
      "true jen tehdy, když je úloha věcně, logicky i jazykově bezchybná a jednoznačná a jediný problém je, že je lehčí " +
        "než skutečné úlohy Scio. Jinak false.",
    ),
  verdict: z.enum(["accept", "reject"]),
});
export type Validation = z.infer<typeof ValidationSchema>;

const GENERATED_FORMAT = zodOutputFormat(GeneratedSchema);
const VALIDATION_FORMAT = zodOutputFormat(ValidationSchema);
// plain JSON schema for request bodies (the parse helper above only runs on our side)
const GENERATED_JSON = { type: "json_schema" as const, schema: GENERATED_FORMAT.schema };
const VALIDATION_JSON = { type: "json_schema" as const, schema: VALIDATION_FORMAT.schema };

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
- Každá možnost přináší SVÁ VLASTNÍ slova: u dvojic/trojic „slovo – slovo – slovo“ (doplňování, analogie) i u synonym
  se žádné slovo nesmí objevit ve dvou možnostech. Nikdy neskládej možnosti kombinováním dvou kandidátů na mezeru
  (např. „početnější“ ve dvou možnostech, „vzácnější“ ve dvou dalších) – odpověď by šla najít vylučováním.
- Formát textu: Markdown; podtržení <u>slovo</u>; prázdné místo ______; matematika KaTeX $...$ (desetinná čárka $4{,}5$);
  tabulky jako GFM Markdown tabulka. Výroky 1) 2) 3) dávej na samostatné řádky oddělené prázdným řádkem.
- Klíče možností: A, B, C, D (u antonym E, F, G, H). U úloh bez sdíleného textu dej passage = null.
- solution: 1–4 věty česky, proč je odpověď správná (u matematiky stručný výpočet).`;

const GENERATOR_SYSTEM_AJ = `Jsi autor úloh pro test Anglický jazyk (AJ) společnosti Scio (Národní srovnávací zkoušky, úroveň B2–C1).
Tvoříš NOVÉ úlohy, které jsou k nerozeznání od skutečných úloh Scio AJ: stejný formát, styl, délka, obtížnost a pravidla.

JAZYK: zadání, texty a možnosti jsou ANGLICKY (britská angličtina, přirozená a bezchybná, publicistický styl BBC/Guardian).
Pole solution a trapDesign piš ČESKY (vysvětlení pro českého studenta). Instrukci (instruction) přepiš anglicky přesně jako ve vzoru.

OBTÍŽNOST: reálné úlohy Scio AJ vyřeší zhruba 40–70 % uchazečů. Proto:
- Každá úloha má aspoň jeden věrohodný chyták (podobný tvar, jiná kolokace, jiný čas, slovo z textu ve špatné souvislosti).
- Každá špatná možnost odpovídá konkrétní typické chybě českého studenta (popiš v trapDesign). Žádný zjevný nesmysl.
- Odpověď nesmí jít uhodnout povrchně (jediná gramaticky možná, nejdelší, doslovně opsaná z textu).

Zásady:
- Drž se přesně pravidel typu a vzorů. Vzory NIKDY nekopíruj ani nepřeformulovávej – jiné téma, jiná slova, jiný kontext.
- Používej jen skutečná anglická slova a ustálené kolokace; gramatika musí být jednoznačná podle standardních pravidel.
  Pokud by v britské i americké angličtině platilo víc možností, úlohu přepracuj.
- Fakta v textech ať jsou věrohodná a neověřitelné detaily (čísla, jména) neutrální; otázky se řeší POUZE z textu.
- Každá část má právě jednu obhajitelnou správnou odpověď. Správné odpovědi rozlož mezi A–D náhodně.
- Formát: Markdown; podtržení <u>word</u>; mezera ______; mezery v cloze textu jako **(1)** ______.
- Klíče možností A, B, C, D. Psaná odpověď (word formation): kind = "text", options = [], answer = slovo VELKÝMI PÍSMENY,
  alsoAccepted = další tvary uznávané slovníky Cambridge/Oxford (např. britský/americký pravopis) nebo null.
- U úloh bez sdíleného textu dej passage = null.`;

const VALIDATOR_SYSTEM_AJ = `Jsi přísný recenzent úloh pro test Anglický jazyk (Scio AJ, úroveň B2–C1). Dostaneš úlohu BEZ klíče.
1) Vyřeš ji sám, pečlivě a nezávisle (gramatiku podle pravidel, slovní zásobu podle významu v kontextu, reading jen z textu).
   U psané odpovědi (word formation) napiš do answers celé slovo velkými písmeny.
2) Posuď kvalitu: jednoznačnost (právě jedna správná možnost i v americké a britské angličtině), správnost a přirozenost
   angličtiny, existenci slov a kolokací, shodu se stylem Scio AJ, sílu chytáků a obtížnost.
3) Obtížnost posuzuj VŮČI PŘILOŽENÝM SKUTEČNÝM ÚLOHÁM SCIO stejného typu – ty jsou měřítkem; ne těžší, ne výrazně lehčí.
   Úloha, kterou by vyřešilo přes 80 % uchazečů, je příliš lehká. Hledej zkratky (jediná gramaticky možná možnost apod.).
Skóre „czech“ hodnotí správnost jazyka zadání (zde angličtiny). Texty reasoning a issues piš česky.
verdict = "reject", pokud má úloha víc obhajitelných odpovědí, žádnou správnou, chybu v angličtině, neexistující slovo
nebo kolokaci, je mimo styl Scio AJ, nebo je příliš lehká / bez chytáku.`;

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

const systemsFor = (exam: ExamId) =>
  exam === "aj" ? { generator: GENERATOR_SYSTEM_AJ, validator: VALIDATOR_SYSTEM_AJ } : { generator: GENERATOR_SYSTEM, validator: VALIDATOR_SYSTEM };

/** For data tasks: keep charts and tables 50/50 in the pool. */
export async function preferChart(exam: ExamId) {
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
type ChartKind = (typeof CHART_KINDS)[number];

// ------------------------------------------------------------------ checks

/** Expected option keys of a part (synonym tasks: part 1 A–D, part 2 E–H). */
const keysFor = (type: TaskType, partIndex: number): OptionKey[] =>
  type === "synonyma" && partIndex === 1 ? ["E", "F", "G", "H"] : ["A", "B", "C", "D"];

/**
 * Re-letters four options that carry wrong keys (e.g. A–D on the antonym part) and moves the answer with them.
 * A format slip like that is not worth throwing a finished task away.
 */
function fixKeys(p: QuestionPart, expected: OptionKey[]): QuestionPart {
  const keys = p.options.map((o) => o.key);
  if (p.kind === "text" || p.options.length !== expected.length || keys.join() === expected.join()) return p;
  const idx = keys.indexOf(p.answer as OptionKey);
  if (new Set(keys).size !== keys.length || idx < 0) return p; // ambiguous – leave it to the checks
  return { ...p, options: p.options.map((o, i) => ({ ...o, key: expected[i] })), answer: expected[idx] };
}

function toGroup(gen: Generated, type: TaskType): Group {
  const meta = taskTypeMeta(type);
  const fixed = type === "porovnani" ? COMPARE_OPTIONS : type === "dostatecnost" ? SUFFICIENCY_OPTIONS : null;
  const questions: Question[] = gen.questions.map((q, i) => ({
    n: i + 1,
    stem: q.stem.trim(),
    ...(q.compare ? { compare: { left: q.compare.left.trim(), right: q.compare.right.trim() } } : {}),
    parts: q.parts.map((p, pi) =>
      fixKeys(
        {
          ...(p.label ? { label: p.label } : {}),
          options: (p.kind === "text" ? [] : p.options).map((o, oi) => ({
            key: o.key.trim().toUpperCase() as OptionKey,
            text: fixed ? fixed[oi] ?? o.text.trim() : o.text.trim(),
          })),
          ...(p.kind === "text" ? { kind: "text" as const } : {}),
          answer: p.kind === "text" ? p.answer.trim().toUpperCase() : p.answer.trim().toUpperCase().replace(/[()]/g, ""),
          ...(p.kind === "text" && p.alsoAccepted?.length
            ? { alsoAccepted: p.alsoAccepted.map((a) => a.trim().toUpperCase()).filter((a) => a && a !== p.answer.trim().toUpperCase()) }
            : {}),
        },
        keysFor(type, pi),
      ),
    ),
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

// ------------------------------------------------------------------ drift guard
// Every generated task is compared with the real Scio tasks of its type: text lengths must stay in the band the
// originals span (with slack) and the language must match the exam. However many tasks were generated before,
// a task that drifts away from the real format (bloated passages, one-word stems, Czech in an English test…)
// is rejected before it reaches the validator.

interface Band {
  min: number;
  max: number;
}
interface StyleProfile {
  stem: Band;
  option: Band;
  passage: Band | null;
}
const profiles = new Map<string, StyleProfile | null>();
const plain = (t: string) => t.replace(/<[^>]+>/g, "").replace(/\$[^$]*\$/g, "x").replace(/[*_|#=-]/g, "").replace(/\s+/g, " ").trim();
const band = (xs: number[], lo = 0.45, hi = 1.7): Band | null =>
  xs.length ? { min: Math.floor(Math.min(...xs) * lo), max: Math.ceil(Math.max(...xs) * hi) } : null;

/** Lengths of what the student reads in the real tasks of a type (stems of cloze gaps and comparisons say nothing). */
function originalLengths(type: TaskType) {
  const meta = taskTypeMeta(type);
  const groups = meta ? groupsOfType(meta.exam, type).map((g) => g.group) : [];
  const qs = groups.flatMap((g) => g.questions);
  return {
    stems: type === "aj_cloze" ? [] : qs.filter((q) => !q.compare).map((q) => plain(q.stem).length).filter((n) => n > 0),
    allStems: qs.map((q) => plain(q.stem).length).filter((n) => n > 0),
    options: qs.flatMap((q) => q.parts.flatMap((p) => p.options.map((o) => plain(o.text).length))),
    passages: groups.map((g) => plain(g.passage ?? "").length).filter((n) => n > 0),
  };
}

/** Length bands of the real tasks of a type (null = no originals to compare with). */
export function styleProfile(type: TaskType): StyleProfile | null {
  if (profiles.has(type)) return profiles.get(type)!;
  const o = originalLengths(type);
  const stem = band(o.allStems);
  const option = band(o.options);
  const profile = stem ? { stem, option: option ?? { min: 0, max: 400 }, passage: band(o.passages, 0.35, 1.5) } : null;
  profiles.set(type, profile);
  return profile;
}

/**
 * The originals' typical lengths, stated in the prompt: the generator aims at the middle of the real range
 * instead of finding the drift guard's limits by trial and error (each miss cost a whole generation).
 */
export function lengthGuide(type: TaskType) {
  const o = originalLengths(type);
  const at = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))];
  const r = (n: number) => (n < 100 ? Math.round(n / 5) * 5 : Math.round(n / 10) * 10);
  const range = (xs: number[]) => `${r(at(xs, 0.1))}–${r(at(xs, 0.9))} znaků`;
  const lines = [
    o.stems.length ? `zadání otázky ${range(o.stems)} (typicky ${r(at(o.stems, 0.5))})` : "",
    o.options.length ? `jedna možnost ${range(o.options)}` : "",
    o.passages.length && type !== "data" ? `společný text ${range(o.passages)}` : "",
  ].filter(Boolean);
  return lines.length ? `Délky jako u skutečných úloh tohoto typu (počítáno bez formátování): ${lines.join("; ")}.` : "";
}

const CZ_LETTERS = /[ěščřžýáíéůúťďň]/gi;
/** Share of Czech diacritic letters among all letters. */
const czechShare = (t: string) => {
  const letters = (t.match(/\p{L}/gu) ?? []).length;
  return letters ? (t.match(CZ_LETTERS) ?? []).length / letters : 0;
};

/** Drift from the real tasks of the type: length outside the originals' band, wrong language. */
export function styleIssues(group: Group, type: TaskType): string[] {
  const issues: string[] = [];
  const meta = taskTypeMeta(type);
  const prof = styleProfile(type);
  if (prof) {
    for (const q of group.questions) {
      const len = plain(q.stem).length;
      // cloze stems are just "Gap (n)" – their length says nothing
      if (type !== "aj_cloze" && !q.compare && len && (len < prof.stem.min || len > prof.stem.max))
        issues.push(`styl: zadání úlohy ${q.n} má ${len} znaků, skutečné úlohy tohoto typu ${prof.stem.min}–${prof.stem.max}`);
      for (const p of q.parts)
        for (const o of p.options) {
          const ol = plain(o.text).length;
          if (ol > prof.option.max) issues.push(`styl: možnost ${o.key} úlohy ${q.n} je příliš dlouhá (${ol} znaků, max. ${prof.option.max})`);
        }
    }
    const pl = plain(group.passage ?? "").length;
    if (prof.passage && pl && !group.chart && type !== "data" && (pl < prof.passage.min || pl > prof.passage.max))
      issues.push(`styl: společný text má ${pl} znaků, skutečné texty tohoto typu ${prof.passage.min}–${prof.passage.max}`);
  }
  // language of what the student reads (solutions are always Czech)
  const shown = [group.passage ?? "", ...group.questions.flatMap((q) => [q.stem, ...q.parts.flatMap((p) => p.options.map((o) => o.text))])].join(" ");
  const cz = czechShare(shown);
  if (meta?.exam === "aj" && cz > 0.005) issues.push("styl: zadání anglické úlohy obsahuje češtinu");
  if (meta?.exam === "osp" && meta.section === "verbal" && plain(shown).length > 80 && cz < 0.02) issues.push("styl: zadání nevypadá česky");
  return issues;
}

/** Deterministic structural checks. Returns a list of problems (empty = OK). */
export function structuralIssues(group: Group, type: TaskType): string[] {
  const issues: string[] = [];
  const meta = taskTypeMeta(type);
  if (!group.questions.length) issues.push("žádné úlohy");
  if (meta && meta.groupSize > 1 && group.questions.length < 2)
    issues.push(`málo úloh ve skupině (${group.questions.length}, má být ${meta.groupSize})`);
  if (meta && meta.groupSize > 1 && !group.passage && !group.chart) issues.push("chybí společný text");
  if (group.chart) issues.push(...chartIssues(group.chart));
  if (type === "data" && !group.chart && !/\|.*\|/.test(group.passage ?? "")) issues.push("chybí tabulka nebo graf");
  issues.push(...styleIssues(group, type));
  issues.push(...optionShapeIssues(group, type));
  for (const q of group.questions) {
    if (!q.stem && !q.compare) issues.push(`úloha ${q.n}: prázdné zadání`);
    if (type === "porovnani" && !q.compare) issues.push(`úloha ${q.n}: chybí výrazy vlevo/vpravo`);
    const expectedParts = type === "synonyma" ? 2 : 1;
    if (q.parts.length !== expectedParts) issues.push(`úloha ${q.n}: počet částí ${q.parts.length}`);
    if (type === "aj_wordform") {
      const p = q.parts[0];
      if (!p || p.kind !== "text") issues.push(`úloha ${q.n}: word formation musí mít psanou odpověď (kind "text", bez možností)`);
      else {
        if (!/^[A-Z][A-Z'-]{1,29}$/.test(p.answer)) issues.push(`úloha ${q.n}: odpověď musí být jedno slovo velkými písmeny (je „${p.answer}“)`);
        const base = q.stem.match(/\(([A-Z][A-Z'-]+)\)\s*\.?\s*$/)?.[1];
        if (!base) issues.push(`úloha ${q.n}: věta musí končit výchozím slovem v závorce, např. (VIOLENCE)`);
        else if (base === p.answer) issues.push(`úloha ${q.n}: odpověď nesmí být stejná jako výchozí slovo`);
        if ((q.stem.match(/_{3,}/g) ?? []).length !== 1) issues.push(`úloha ${q.n}: věta musí mít právě jednu mezeru ______`);
      }
      if (!q.solution) issues.push(`úloha ${q.n}: chybí zdůvodnění`);
      continue;
    }
    if (q.parts.some((p) => p.kind === "text")) issues.push(`úloha ${q.n}: psaná odpověď patří jen k word formation`);
    q.parts.forEach((p, pi) => {
      const keys = keysFor(type, pi);
      // spelled out: the lesson distiller once read a bare "klíče možností" as "use A–E"
      const got = p.options.map((o) => o.key).join(", ");
      if (got !== keys.join(", ")) issues.push(`úloha ${q.n}: klíče možností musí být přesně ${keys.join(", ")} (jsou ${got || "žádné"})`);
      if (!keys.includes(p.answer as OptionKey)) issues.push(`úloha ${q.n}: odpověď „${p.answer}“ není mezi ${keys.join(", ")}`);
      const texts = p.options.map((o) => o.text.toLowerCase());
      if (new Set(texts).size !== texts.length) issues.push(`úloha ${q.n}: duplicitní možnosti`);
      if (p.options.some((o) => !o.text)) issues.push(`úloha ${q.n}: prázdná možnost`);
    });
    const all = [q.stem, group.passage ?? "", ...q.parts.flatMap((p) => p.options.map((o) => o.text))].join(" ");
    if (((all.replace(/\\\$/g, "").match(/\$/g) ?? []).length) % 2) issues.push(`úloha ${q.n}: nespárované $`);
    if (type === "synonyma" && !/<u>.+<\/u>/.test(q.stem)) issues.push(`úloha ${q.n}: chybí podtržený výraz`);
    if (type === "aj_cloze" && !group.passage?.includes(`(${q.n})`)) issues.push(`úloha ${q.n}: v textu chybí mezera (${q.n})`);
    if (!q.solution) issues.push(`úloha ${q.n}: chybí zdůvodnění`);
  }
  return issues;
}

// ------------------------------------------------------------------ verdict

/** Validator letters for one question, one per part. Tolerates "C/F", "C, F" or "(C)" in a single string. */
function validatorLetters(v: Validation, qi: number) {
  return (v.answers[qi] ?? []).flatMap((a) => a.toUpperCase().match(/[A-H]/g) ?? []);
}

export interface Verdict {
  /** accept = into the pool; easy = correct but easier than Scio (may join as a rare easy task); reject = discard */
  status: "accept" | "easy" | "reject";
  keyMatches: boolean;
  hardEnough: boolean;
}

export function judge(group: Group, v: Validation): Verdict {
  // Validators sometimes list each part as its own entry ([["D"],["G"]] instead of [["D","G"]]):
  // when the total number of letters matches the number of parts, compare them in order.
  const typed = group.questions.some((q) => q.parts.some((p) => p.kind === "text"));
  const key = group.questions.flatMap((q) => q.parts.map((p) => p.answer));
  const all = v.answers.flatMap((a) => a.flatMap((x) => x.toUpperCase().match(/[A-H]/g) ?? []));
  const keyMatches = typed
    ? // typed words: the validator's word must be one of the accepted spellings
      group.questions.every((q, qi) => q.parts.every((p, pi) => partCorrect(p, (v.answers[qi] ?? v.answers.flat())[pi] ?? "")))
    : all.length === key.length
      ? key.every((k, i) => all[i] === k)
      : group.questions.every((q, qi) => {
          const letters = validatorLetters(v, qi);
          return q.parts.every((p, pi) => letters[pi] === p.answer);
        });
  const s = v.scores;
  // correctness bars stay strict; style/difficulty bars match real Scio tasks (not "harder than Scio")
  const correct = [s.unambiguous, s.czech, s.real_words].every((x) => x >= 8) && s.scio_style >= 7;
  const scoresOk = correct && [s.difficulty, s.distractors].every((x) => x >= 6);
  const hardEnough = !v.shortcut && v.predictedSuccess >= 20 && v.predictedSuccess <= 75;
  if (keyMatches && scoresOk && hardEnough && v.verdict === "accept") return { status: "accept", keyMatches, hardEnough };
  // Correct and unambiguous, just easier than Scio: no shortcut, believable distractors, the validator saw no other
  // problem. Kept only as a small minority of the pool (see families.ts).
  const easy =
    keyMatches &&
    correct &&
    !v.shortcut &&
    s.distractors >= 5 &&
    v.predictedSuccess >= 20 && // not the "nonsensically hard" end
    v.predictedSuccess <= 90 &&
    (v.onlyTooEasy || v.verdict === "accept");
  return { status: easy ? "easy" : "reject", keyMatches, hardEnough };
}

/** The validator's acceptance bar, given to the generator so it can self-check before answering. */
const ACCEPTANCE_CRITERIA = `KRITÉRIA, PODLE KTERÝCH ÚLOHU NEZÁVISLE OHODNOTÍ VALIDÁTOR (musí projít všechna):
- validátor úlohu vyřeší sám a musí dojít k TVÉMU klíči – každá část má právě jednu obhajitelnou odpověď;
- čeština bez chyb, všechna slova existují, významové vztahy platí (≥ 8/10);
- styl Scio ≥ 7/10, obtížnost a síla chytáků ≥ 6/10 – srovnatelné se skutečnými úlohami Scio daného typu;
- odhad úspěšnosti uchazečů 20–75 % (ne lehčí, ne nesmyslně těžká), žádná povrchní zkratka k odpovědi;
- u synonym/antonym přesně 2 části (synonymum A–D, antonymum E–H); u word formation psaná odpověď (kind "text").
Než odpovíš, úlohu si sám vyřeš od nuly, jako bys klíč neznal, a zkontroluj každé kritérium. Najdeš-li problém, oprav ho.`;

export function rejectionText(group: Group, verdict: Verdict, v: Validation) {
  const parts: string[] = [];
  if (!verdict.keyMatches) {
    const typed = group.questions.some((q) => q.parts.some((p) => p.kind === "text"));
    const all = typed
      ? v.answers.flat().join("/")
      : v.answers.flatMap((a) => a.flatMap((x) => x.toUpperCase().match(/[A-H]/g) ?? [])).join("/");
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

function dataFormatInstruction(useChart: boolean, kind: ChartKind) {
  if (!useChart)
    return "Data zadej jako Markdown TABULKU v poli passage (pod krátký popis situace). Pole chart = null.";
  const names = { bar: "sloupcový (bar)", line: "spojnicový (line)", stacked: "skládaný sloupcový (stacked)", pie: "koláčový (pie)" };
  return `Data zadej jako GRAF v poli chart, typ ${names[kind]}. passage obsahuje jen krátký popis situace (bez tabulky a bez opakování hodnot).
Pravidla grafu: 2–8 kategorií, 1–4 řady (koláč: 1 řada, max. 6 výsečí, hodnoty v procentech se součtem 100).
U sloupcového/spojnicového/skládaného grafu zvol yStep (např. 1, 2, 5, 10, 20, 50, 100) a VŠECHNY hodnoty musí být násobky yStep,
aby šly přesně odečíst z mřížky; maximum osy max. 14 kroků. Vyplň xLabel, yLabel a unit. Otázky se ptají na čtení a výpočty z grafu.`;
}

// ------------------------------------------------------------------ candidates and their prompts
// A generator prompt is split by how often its parts change, so the expensive part is read from the prompt cache:
//   system  – exam rules + per-type block (rules, traps, lengths, a fixed deck of real Scio tasks, criteria):
//             the same for every candidate of the type during the hour → 1-hour cache, read at 5 % of the price
//   message – what differs per candidate (lessons, used words / offered words, domain, chart or table, parent task)
// The validator is laid out the same way: system + type block + its deck of reference tasks cached, the task last.

/** One task to be generated. Everything random is decided here, so a batch job can rebuild its prompt later. */
export interface Candidate {
  exam: ExamId;
  type: TaskType;
  /** fresh = a new task modelled on real Scio tasks; variant = a re-skin of a validated pool task (same principle) */
  kind: "fresh" | "variant";
  deck: number;
  steer: { domain: string; wordClass: string | null };
  /** Position in its batch: odd ones aim slightly harder. */
  index: number;
  /** Data tasks: chart or table. */
  chart: { use: boolean; kind: ChartKind } | null;
  /** Synonym / word-formation tasks: unused words to pick the tested word from. */
  words: string[] | null;
  parent: ParentTask | null;
}

/** Settings of one run that may differ from the env defaults (A/B tests). */
export interface GenOverrides {
  model?: string;
  firstEffort?: Effort;
  revisionEffort?: Effort;
  variantModel?: string;
}
type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** The generator model of a task type (AI_MODEL_BY_TYPE overrides AI_MODEL). */
export const generatorModelFor = (type: TaskType) => AI.modelByType[type] ?? AI.model;

/** Real Scio groups of the current deck rendered as prompt examples. */
export function examplesFor(exam: ExamId, type: TaskType, deck = currentDeck(type)) {
  const meta = taskTypeMeta(type)!;
  const examples = deckGroups(exam, type, deck, meta.groupSize > 1 ? 2 : 4, "gen");
  return {
    examples,
    text: examples.map((e, ei) => `### Vzor ${ei + 1} (${e.test.title})\n${taskToPrompt(e.group)}`).join("\n\n"),
  };
}

/** The cached per-type part of the generator prompt. */
export function staticPrompt(type: TaskType, deck: number, kind: Candidate["kind"]) {
  const meta = taskTypeMeta(type)!;
  const size = meta.groupSize > 1 ? `Úloha je skupina ${meta.groupSize} otázek ke společnému textu/datům (passage).` : "Úloha obsahuje 1 otázku.";
  const common = `Pravidla typu:
${meta.rules}

Chytáky typické pro tento typ (zabuduj je):
${meta.traps}

${lengthGuide(type)}`;
  if (kind === "variant")
    return `Vytvoř VARIANTU existující úlohy typu „${meta.name}“ (${meta.description}). Původní úlohu dostaneš níže i se správnou odpovědí
a rozborem chytáků. ${size}

${common}

Jak tvořit variantu:
- Zachovej princip řešení a druh chytáku původní úlohy – student si má stejný princip procvičit znovu.
- Všechno ostatní změň: kontext a oblast, osoby, předměty, jednotky, čísla a formulaci. Varianta musí působit jako samostatná úloha.
- Čísla zvol nová a vše přepočítej od nuly; výsledek ani žádný mezivýsledek nesmí jít opsat z původní úlohy.
- Obtížnost drž stejnou jako u původní úlohy – ne lehčí.
- Pole topic a focus vyplň pro variantu (nové téma, stejný princip).

${ACCEPTANCE_CRITERIA}`;
  return `Vytvoř 1 novou úlohu typu „${meta.name}“ (${meta.description}).
${size}

${common}

Skutečné úlohy Scio jako vzor (styl, délka, obtížnost – NEKOPÍROVAT):
${examplesFor(meta.exam, type, deck).text}

${ACCEPTANCE_CRITERIA}`;
}

/**
 * The per-candidate part of the generator prompt. Its size is bounded however big the pool gets: the variety block
 * lists at most 250 words / 30 recent tasks and lessons are capped (checked by `npm run check:generator`).
 */
export function generatorTail(c: Candidate, ctx: { lessons: Lessons | null; pool: Focus[] }) {
  const meta = taskTypeMeta(c.type)!;
  const blocks = [lessonsBlock(ctx.lessons)];
  if (c.parent) {
    const traps = c.parent.trapDesign.filter(Boolean);
    blocks.push(
      `PŮVODNÍ ÚLOHA, ze které varianta vychází (se správnou odpovědí):\n${taskToPrompt(c.parent.group)}`,
      traps.length ? `Rozbor chytáků původní úlohy:\n${traps.map((t, i) => (traps.length > 1 ? `${i + 1}) ${t}` : t)).join("\n")}` : "",
      varietyBlock(c.type, ctx.pool),
      `Variace: zasaď variantu do oblasti „${c.steer.domain}“ – jiný kontext než původní úloha („${c.parent.topic}“).`,
    );
  } else {
    blocks.push(
      c.words?.length ? wordsBlock(c.type, c.words) : varietyBlock(c.type, ctx.pool),
      `Variace č. ${c.index + 1}: zasaď úlohu do oblasti „${c.steer.domain}“ (jiné než vzory)` +
        (c.steer.wordClass && !c.words?.length ? `; podtržený výraz ať je ${c.steer.wordClass}` : "") +
        (c.index % 2 ? " a zvol mírně vyšší obtížnost" : "") +
        "." +
        (meta.exam === "aj" ? " Téma zvol z této oblasti, ale celé zadání piš anglicky." : ""),
    );
  }
  blocks.push(c.chart ? dataFormatInstruction(c.chart.use, c.chart.kind) : "Pole chart nastav na null.");
  blocks.push("Než odpovíš, úlohu si sám vyřeš od nuly, jako bys klíč neznal, a zkontroluj všechna kritéria výše.");
  return blocks.map((b) => b.trim()).filter(Boolean).join("\n\n");
}

/** Whole generator prompt as text (self-checks). */
export const generatorPromptText = (c: Candidate, ctx: { lessons: Lessons | null; pool: Focus[] }) =>
  `${staticPrompt(c.type, c.deck, c.kind)}\n\n${generatorTail(c, ctx)}`;

const HOUR_CACHE = { type: "ephemeral", ttl: "1h" } as const;
type Params = Anthropic.MessageCreateParamsNonStreaming;

/** Feedback for the one revision a rejected candidate gets. */
export function revisionFeedback(problem: string, validation: Validation | null) {
  return `Úlohu kontrola ZAMÍTLA. Důvod: ${problem}
${validation ? `Validátorovo řešení: ${validation.reasoning.slice(0, 1500)}` : ""}

Oprav úlohu tak, aby všechny výtky zmizely a prošla kritérii. Pokud měl validátor u klíče pravdu, oprav klíč;
pokud ne, uprav zadání nebo možnosti tak, aby byla odpověď jednoznačná. Je-li úloha příliš lehká, přidej
skutečný chyták a zvyš obtížnost. Vrať celou opravenou úlohu ve stejném formátu.`;
}

/**
 * Generator request of a candidate. attempt 1 = the same conversation plus the rejected answer and the feedback.
 * `batch`: batch revisions come long after the first request, so the per-candidate part is not worth caching there.
 */
export function generatorRequest(
  c: Candidate,
  tail: string,
  o: { attempt: number; previous?: string; feedback?: string; batch?: boolean; overrides?: GenOverrides },
): { params: Params; model: string; stage: AiStage } {
  const variant = c.kind === "variant";
  const model = variant ? (o.overrides?.variantModel ?? AI.variantModel) : (o.overrides?.model ?? generatorModelFor(c.type));
  const effort: Effort = variant
    ? AI.variantEffort
    : o.attempt
      ? (o.overrides?.revisionEffort ?? AI.revisionEffort)
      : (o.overrides?.firstEffort ?? AI.firstEffort);
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: [{ type: "text", text: tail, ...(o.batch ? {} : { cache_control: { type: "ephemeral" as const } }) }] },
  ];
  if (o.attempt && o.previous && o.feedback)
    messages.push({ role: "assistant", content: o.previous }, { role: "user", content: o.feedback });
  return {
    model,
    stage: variant ? (o.attempt ? "variant-revise" : "variant") : o.attempt ? "revise" : "fresh",
    params: {
      model,
      max_tokens: 20000, // non-streaming requests must stay under the SDK's 10-minute ceiling (~21k)
      output_config: { effort, format: GENERATED_JSON },
      system: [
        { type: "text", text: systemsFor(c.exam).generator },
        { type: "text", text: staticPrompt(c.type, c.deck, c.kind), cache_control: HOUR_CACHE },
      ],
      messages,
    },
  };
}

/** Validator request: the type block and the deck's real reference tasks are cached, the judged task comes last. */
export function validatorRequest(group: Group, type: TaskType, deck: number): Params {
  const meta = taskTypeMeta(type);
  const exam = meta?.exam ?? "osp";
  // real Scio tasks of the same type anchor the difficulty judgement (keys included – they're reference only)
  const reference = deckGroups(exam, type, deck, meta && meta.groupSize > 1 ? 1 : 2, "val")
    .map((e, i) => `### Skutečná úloha Scio ${i + 1} (měřítko obtížnosti)\n${taskToPrompt(e.group)}`)
    .join("\n\n");
  return {
    model: AI.validatorModel,
    max_tokens: 16000,
    output_config: { effort: AI.validatorEffort, format: VALIDATION_JSON },
    system: [{ type: "text", text: systemsFor(exam).validator }],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Typ úlohy: ${meta?.name}\nPravidla typu: ${meta?.rules}\nTypické chytáky Scio u tohoto typu: ${meta?.traps}\n\n${reference}`,
            cache_control: HOUR_CACHE,
          },
          {
            type: "text",
            // a missing entry counts as a wrong answer, so say how many are expected
            text: `### POSUZOVANÁ ÚLOHA (bez klíče; počet otázek: ${group.questions.length} – do answers uveď řešení každé z nich)\n${taskToPrompt(group, group.questions, false)}`,
          },
        ],
      },
    ],
  };
}

const answerText = (m: Anthropic.Message) => m.content.map((b) => (b.type === "text" ? b.text : "")).join("");

export function parseGenerated(m: Anthropic.Message): Generated | null {
  try {
    return GENERATED_FORMAT.parse(answerText(m));
  } catch {
    return null;
  }
}

export function parseValidation(m: Anthropic.Message): Validation | null {
  try {
    return VALIDATION_FORMAT.parse(answerText(m));
  } catch {
    return null;
  }
}

/** Decides the random parts of `count` candidates of a type (variants take the last slots, one per parent). */
export async function planCandidates(o: {
  exam: ExamId;
  type: TaskType;
  count: number;
  parents?: ParentTask[];
  pool: Focus[];
  chartFirst: boolean;
  log: Logger;
}): Promise<Candidate[]> {
  const parents = (o.parents ?? []).slice(0, o.count);
  const freshCount = o.count - parents.length;
  const steer = steering(o.type, o.count);
  const deck = currentDeck(o.type);
  const words = needsWords(o.type)
    ? await freshWords(o.type, o.pool, steer.slice(0, freshCount).map((s) => s.wordClass), (e) => o.log(e))
    : [];
  return Array.from({ length: o.count }, (_, i): Candidate => {
    const parent = i >= freshCount ? parents[i - freshCount] : null;
    const chart =
      o.type !== "data"
        ? null
        : parent
          ? { use: Boolean(parent.group.chart), kind: parent.group.chart?.kind ?? "bar" }
          : { use: i % 2 === 0 ? o.chartFirst : !o.chartFirst, kind: CHART_KINDS[Math.floor(Math.random() * CHART_KINDS.length)] };
    return { exam: o.exam, type: o.type, kind: parent ? "variant" : "fresh", deck, steer: steer[i], index: i, chart, words: words[i] ?? null, parent };
  });
}

/** A generated task after the deterministic checks. `problem` empty = ready for the validator. */
export function reviewGenerated(c: Candidate, gen: Generated, pool: PoolEntry[], siblings: Focus[]) {
  const group = toGroup(gen, c.type);
  const issues = structuralIssues(group, c.type);
  const focus = focusOf(c.type, { topic: gen.topic, focus: gen.focus, stem: group.questions[0]?.stem });
  const problem = issues.length ? `struktura: ${issues.join("; ")}` : repetitionFor(c, focus, pool, siblings);
  return { group, focus, problem };
}

/** Too similar to the pool or batch siblings? A variant is compared with its own family by context only. */
export function repetitionFor(c: Candidate, focus: Focus, pool: PoolEntry[], siblings: Focus[]) {
  if (!c.parent) return repetitionIssue(c.type, focus, pool.map((p) => p.focus), siblings);
  const family = c.parent.family;
  const others = pool.filter((p) => p.family !== family).map((p) => p.focus);
  const members = [
    ...pool.filter((p) => p.family === family).map((p) => p.focus),
    focusOf(c.type, { topic: c.parent.topic, focus: c.parent.focus, stem: c.parent.group.questions[0]?.stem }),
  ];
  return repetitionIssue(c.type, focus, others, siblings) || familyIssue(focus, members);
}

export const acceptNote = (c: Candidate, attempt: number, easy: boolean) =>
  `${c.type}: ${attempt ? "revised" : "first"}${c.parent ? " variant" : ""}${easy ? " easy" : ""}`;

/** Stores an accepted task in the shared pool. Returns its id. */
export async function storeTask(
  c: Candidate,
  t: { gen: Generated; group: Group; validation: Validation; model: string; attempt: number; easy: boolean; userId?: string | null; batch?: boolean },
) {
  const s = t.validation.scores;
  const quality = (s.unambiguous + s.czech + s.real_words + s.scio_style + s.difficulty + s.distractors) / 6;
  const { data, error } = await createAdminClient()
    .from("generated_tasks")
    .insert({
      exam: c.exam,
      task_type: c.type,
      payload: {
        ...t.group,
        topic: t.gen.topic,
        focus: t.gen.focus,
        v: GENERATOR_VERSION,
        trapDesign: t.gen.questions.map((q) => q.trapDesign),
        ...(t.easy ? { easy: true } : {}),
        ...(c.parent ? { family: c.parent.family, variantOf: c.parent.id } : {}),
      },
      quality,
      validator: t.validation,
      model: t.model,
      seed_refs: c.parent ? [`gen:${c.parent.id}`] : examplesFor(c.exam, c.type, c.deck).examples.map((e) => `${e.test.id}:${e.group.id}`),
      created_by: t.userId ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`db: ${error.message}`);
  await logAiCall({ userId: t.userId, kind: "accept", model: t.model, type: c.type, note: acceptNote(c, t.attempt, t.easy), batch: t.batch });
  return data.id as string;
}

// ------------------------------------------------------------------ public API

export interface GenerationOutcome {
  accepted: { id: string; group: Group; validation: Validation; attempt: number; easy: boolean; variant: boolean }[];
  rejected: { reason: string }[];
}

type LogEntry = { kind: AiCallKind; model: string; usage: Anthropic.Usage; ok: boolean; stage: AiStage };
type Logger = (e: LogEntry) => Promise<void>;

/** Delay of the 2nd+ parallel candidate, so it reads the per-type prefix the first one wrote to the cache. */
const STAGGER_MS = 5000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Generates `count` candidate groups of a type right away (the user may be waiting), checks them structurally and
 * with an independent AI validator, and stores the accepted ones in the shared pool. Background generation goes
 * through the Batch API instead (server/batch-gen.ts) – same prompts and checks, half the price.
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
  /** Dry runs only: pretend these tasks are already in the pool (drift tests – the variety pressure grows like in production). */
  simulatedPool?: Focus[];
  /** Pool tasks to derive variants from – each takes one of the `count` candidates. */
  parents?: ParentTask[];
  overrides?: GenOverrides;
  /** Called with the cost of every API call, dry runs included (A/B tests). */
  onCost?: (usd: number, kind: AiCallKind) => void;
}): Promise<GenerationOutcome> {
  const { exam, type, count, userId, dryRun, deadline, simulatedPool, overrides, onCost } = opts;
  // a revision round = generate + validate again ≈ up to 2.5 min
  const timeForRevision = () => !deadline || Date.now() + 150_000 < deadline;
  if (!taskTypeMeta(type)) throw new Error(`Neznámý typ úlohy ${type}`);

  const log: Logger = async (e) => {
    onCost?.(costUsd(e.model, e.usage), e.kind);
    if (!dryRun) await logAiCall({ userId, kind: e.kind, model: e.model, usage: e.usage, ok: e.ok, type, stage: e.stage });
  };
  const logReject = (reason: string) =>
    dryRun ? Promise.resolve() : logAiCall({ userId, kind: "reject", model: generatorModelFor(type), type, note: `${type}: ${reason}`.slice(0, 1000) });
  const simulated = (simulatedPool ?? []).map((focus, i): PoolEntry => ({ id: `sim-${i}`, focus, family: `sim-${i}` }));
  const freshPool = async () => (simulatedPool ? simulated : dryRun ? [] : await poolFocuses(exam, type));

  const pool = await freshPool();
  const [lessons, chartFirst] = await Promise.all([
    dryRun ? null : getLessons(type).catch(() => null),
    type === "data" ? (dryRun ? Math.random() < 0.5 : preferChart(exam)) : false,
  ]);
  const candidates = await planCandidates({ exam, type, count, parents: opts.parents, pool: pool.map((p) => p.focus), chartFirst, log });
  const siblings: Focus[] = []; // accepted-so-far candidates of this batch (they run in parallel)

  const run = async (c: Candidate): Promise<{ accepted: GenerationOutcome["accepted"][number] } | { rejected: string }> => {
    const tail = generatorTail(c, { lessons, pool: pool.map((p) => p.focus) });
    let previous: string | undefined;
    let feedback: string | undefined;
    let lastReason = "";
    // a correct but easier-than-Scio version, kept in case no attempt passes
    let easy: { gen: Generated; group: Group; validation: Validation; focus: Focus; attempt: number; model: string } | null = null;
    const keep = async (t: { gen: Generated; group: Group; validation: Validation; focus: Focus; attempt: number; model: string }, isEasy: boolean) => {
      siblings.push(t.focus);
      const result = { group: { ...t.group, topic: t.gen.topic, focus: t.gen.focus } as Group, validation: t.validation, attempt: t.attempt, easy: isEasy, variant: c.kind === "variant" };
      if (dryRun) return { accepted: { id: "dry-run", ...result } };
      return { accepted: { id: await storeTask(c, { ...t, easy: isEasy, userId }), ...result } };
    };
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const req = generatorRequest(c, tail, { attempt, previous, feedback, overrides });
        const msg = await anthropic().messages.create(req.params);
        const gen = parseGenerated(msg);
        await log({ kind: "generate", model: req.model, usage: msg.usage, ok: Boolean(gen), stage: req.stage });
        if (!gen) {
          lastReason = `generátor nevrátil platný JSON (${msg.stop_reason})`;
          await logReject(lastReason);
          break;
        }
        // fresh pool: other workers may have stored a task with the same word since this batch started
        const reviewed = reviewGenerated(c, gen, await freshPool(), siblings);
        let problem = reviewed.problem;
        let validation: Validation | null = null;
        if (!problem) {
          const vmsg = await anthropic().messages.create(validatorRequest(reviewed.group, type, c.deck));
          validation = parseValidation(vmsg);
          await log({ kind: "validate", model: AI.validatorModel, usage: vmsg.usage, ok: Boolean(validation), stage: "validate" });
          if (!validation) throw new Error(`Validator parse failed (${vmsg.stop_reason})`);
          const verdict = judge(reviewed.group, validation);
          if (verdict.status === "easy") easy = { gen, group: reviewed.group, validation, focus: reviewed.focus, attempt, model: req.model };
          if (verdict.status !== "accept") problem = `validátor: ${rejectionText(reviewed.group, verdict, validation)}`;
        }
        // a parallel candidate of this batch may have taken the same word while this one was being validated
        if (!problem && validation) problem = repetitionFor(c, reviewed.focus, [], siblings);
        if (!problem && validation)
          return await keep({ gen, group: reviewed.group, validation, focus: reviewed.focus, attempt, model: req.model }, false);

        // remember why it failed (the generator learns from this) and give it one chance to fix it
        lastReason = attempt ? `[po opravě] ${problem}` : problem;
        await logReject(lastReason);
        if (attempt === 0 && !timeForRevision()) {
          lastReason = `${problem} [bez opravy – došel čas]`;
          break;
        }
        previous = JSON.stringify(gen);
        feedback = revisionFeedback(problem, validation);
      }
      // nothing passed: a correct, only easier version may still join the pool – as long as easy tasks stay rare
      if (easy && !repetitionFor(c, easy.focus, [], siblings) && (dryRun || (await easyAllowed(exam, type)))) return await keep(easy, true);
      return { rejected: lastReason || "neznámý důvod" };
    } catch (err) {
      console.error("generateTasks", err);
      const reason = err instanceof Error ? err.message : "chyba";
      await logReject(`chyba: ${reason}`);
      // the revision failed for a technical reason – an easy version from the first attempt is still worth keeping
      if (easy && !dryRun && !repetitionFor(c, easy.focus, [], siblings))
        try {
          if (await easyAllowed(exam, type)) return await keep(easy, true);
        } catch (e) {
          console.error("generateTasks easy fallback", e);
        }
      return { rejected: reason };
    }
  };

  // A cache entry is readable only once the first request using it is under way, so parallel candidates would each
  // write the same per-type prefix. The first one starts alone; the rest follow a few seconds later and read it.
  const results = await Promise.all(candidates.map((c, i) => (i ? sleep(STAGGER_MS).then(() => run(c)) : run(c))));
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
    if ("accepted" in r) outcome.accepted.push(r.accepted);
    else outcome.rejected.push({ reason: r.rejected });
  }
  if (outcome.rejected.length) console.warn(`generateTasks ${type}: rejected`, outcome.rejected);
  return outcome;
}
