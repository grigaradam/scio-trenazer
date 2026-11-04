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
import { partCorrect } from "@/lib/scoring";
import { taskToPrompt } from "./format";
import { optionShapeIssues } from "./option-shape";
import { getLessons, lessonsBlock, refreshLessons, type Lessons } from "./lessons";
import { logAiCall } from "./usage";
import { type Focus, focusOf, poolFocuses, repetitionIssue, steering, varietyBlock } from "./variety";
import { after } from "next/server";

// ------------------------------------------------------------------ schemas

const OptionSchema = z.object({ key: z.string(), text: z.string() });
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
type Generated = z.infer<typeof GeneratedSchema>;

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

const systemsFor = (exam: ExamId) =>
  exam === "aj" ? { generator: GENERATOR_SYSTEM_AJ, validator: VALIDATOR_SYSTEM_AJ } : { generator: GENERATOR_SYSTEM, validator: VALIDATOR_SYSTEM };

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
      options: (p.kind === "text" ? [] : p.options).map((o, oi) => ({
        key: o.key.trim().toUpperCase() as OptionKey,
        text: fixed ? fixed[oi] ?? o.text.trim() : o.text.trim(),
      })),
      ...(p.kind === "text" ? { kind: "text" as const } : {}),
      answer: p.kind === "text" ? p.answer.trim().toUpperCase() : p.answer.trim().toUpperCase().replace(/[()]/g, ""),
      ...(p.kind === "text" && p.alsoAccepted?.length
        ? { alsoAccepted: p.alsoAccepted.map((a) => a.trim().toUpperCase()).filter((a) => a && a !== p.answer.trim().toUpperCase()) }
        : {}),
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

/** Length bands of the real tasks of a type (null = no originals to compare with). */
export function styleProfile(type: TaskType): StyleProfile | null {
  if (profiles.has(type)) return profiles.get(type)!;
  const meta = taskTypeMeta(type);
  const groups = meta ? groupsOfType(meta.exam, type).map((g) => g.group) : [];
  const qs = groups.flatMap((g) => g.questions);
  const stem = band(qs.map((q) => plain(q.stem).length).filter((n) => n > 0));
  const option = band(qs.flatMap((q) => q.parts.flatMap((p) => p.options.map((o) => plain(o.text).length))));
  const passages = groups.map((g) => plain(g.passage ?? "").length).filter((n) => n > 0);
  const profile = stem ? { stem, option: option ?? { min: 0, max: 400 }, passage: band(passages, 0.35, 1.5) } : null;
  profiles.set(type, profile);
  return profile;
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
      const keys = type === "synonyma" && pi === 1 ? ["E", "F", "G", "H"] : ["A", "B", "C", "D"];
      // spelled out: the lesson distiller once read a bare "klíče možností" as "use A–E"
      const got = p.options.map((o) => o.key).join(", ");
      if (got !== keys.join(", ")) issues.push(`úloha ${q.n}: klíče možností musí být přesně ${keys.join(", ")} (jsou ${got || "žádné"})`);
      if (!keys.includes(p.answer)) issues.push(`úloha ${q.n}: odpověď „${p.answer}“ není mezi ${keys.join(", ")}`);
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

async function validate(group: Group, type: TaskType, userId?: string): Promise<Validation> {
  const meta = taskTypeMeta(type);
  const exam = meta?.exam ?? "osp";
  // real Scio tasks of the same type anchor the difficulty judgement (keys included – they're reference only)
  const reference = pickExamples(exam, type, meta && meta.groupSize > 1 ? 1 : 2)
    .map((e, i) => `### Skutečná úloha Scio ${i + 1} (měřítko obtížnosti)\n${taskToPrompt(e.group)}`)
    .join("\n\n");
  const response = await anthropic().messages.parse({
    model: AI.validatorModel,
    max_tokens: 16000,
    output_config: { effort: AI.validatorEffort, format: zodOutputFormat(ValidationSchema) },
    system: [{ type: "text", text: systemsFor(exam).validator, cache_control: { type: "ephemeral" } }],
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
          {
            type: "text",
            // a missing entry counts as a wrong answer, so say how many are expected
            text: `${reference}\n\n### POSUZOVANÁ ÚLOHA (bez klíče; počet otázek: ${group.questions.length} – do answers uveď řešení každé z nich)\n${taskToPrompt(group, group.questions, false)}`,
          },
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
- u synonym/antonym přesně 2 části (synonymum A–D, antonymum E–H); u word formation psaná odpověď (kind "text").
Než odpovíš, úlohu si sám vyřeš od nuly, jako bys klíč neznal, a zkontroluj každé kritérium. Najdeš-li problém, oprav ho.`;

function rejectionText(group: Group, verdict: ReturnType<typeof accepts>, v: Validation) {
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

function dataFormatInstruction(useChart: boolean, kind: (typeof CHART_KINDS)[number]) {
  if (!useChart)
    return "Data zadej jako Markdown TABULKU v poli passage (pod krátký popis situace). Pole chart = null.";
  const names = { bar: "sloupcový (bar)", line: "spojnicový (line)", stacked: "skládaný sloupcový (stacked)", pie: "koláčový (pie)" };
  return `Data zadej jako GRAF v poli chart, typ ${names[kind]}. passage obsahuje jen krátký popis situace (bez tabulky a bez opakování hodnot).
Pravidla grafu: 2–8 kategorií, 1–4 řady (koláč: 1 řada, max. 6 výsečí, hodnoty v procentech se součtem 100).
U sloupcového/spojnicového/skládaného grafu zvol yStep (např. 1, 2, 5, 10, 20, 50, 100) a VŠECHNY hodnoty musí být násobky yStep,
aby šly přesně odečíst z mřížky; maximum osy max. 14 kroků. Vyplň xLabel, yLabel a unit. Otázky se ptají na čtení a výpočty z grafu.`;
}

/**
 * The generator prompt of one candidate. Its size is bounded however big the pool gets: the variety block lists at most
 * 250 words / 30 recent tasks and lessons are capped, while the real Scio examples are always part of it – so the 500th
 * task is anchored to the originals exactly like the 1st one (checked by `npm run check:generator`).
 */
export function generatorPrompt(o: {
  type: TaskType;
  examplesText: string;
  lessons: Lessons | null;
  pool: Focus[];
  steer: { domain: string; wordClass: string | null };
  variant: number;
  chartFirst: boolean;
}) {
  const meta = taskTypeMeta(o.type)!;
  const i = o.variant;
  return `Vytvoř 1 novou úlohu typu „${meta.name}“ (${meta.description}).
${meta.groupSize > 1 ? `Úloha je skupina ${meta.groupSize} otázek ke společnému textu/datům (passage).` : "Úloha obsahuje 1 otázku."}

Pravidla typu:
${meta.rules}

Chytáky typické pro tento typ (zabuduj je):
${meta.traps}
${lessonsBlock(o.lessons)}
Skutečné úlohy Scio jako vzor (styl, délka, obtížnost – NEKOPÍROVAT):
${o.examplesText}

${varietyBlock(o.type, o.pool)}
Variace č. ${i + 1}: zasaď úlohu do oblasti „${o.steer.domain}“ (jiné než vzory)${o.steer.wordClass ? `; podtržený výraz ať je ${o.steer.wordClass}` : ""}${i % 2 ? " a zvol mírně vyšší obtížnost" : ""}.${meta.exam === "aj" ? " Téma zvol z této oblasti, ale celé zadání piš anglicky." : ""}
${o.type === "data" ? dataFormatInstruction(i % 2 === 0 ? o.chartFirst : !o.chartFirst, CHART_KINDS[Math.floor(Math.random() * CHART_KINDS.length)]) : "Pole chart nastav na null."}

${ACCEPTANCE_CRITERIA}`;
}

/** Real Scio groups of a type rendered as prompt examples. */
export function examplesFor(exam: ExamId, type: TaskType) {
  const meta = taskTypeMeta(type)!;
  const examples = pickExamples(exam, type, meta.groupSize > 1 ? 2 : 4);
  return {
    examples,
    text: examples.map((e, ei) => `### Vzor ${ei + 1} (${e.test.title})\n${taskToPrompt(e.group)}`).join("\n\n"),
  };
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
  /** Dry runs only: pretend these tasks are already in the pool (drift tests – the variety pressure grows like in production). */
  simulatedPool?: Focus[];
}): Promise<GenerationOutcome> {
  const { exam, type, count, userId, dryRun, deadline, simulatedPool } = opts;
  // a revision round = generate + validate again ≈ up to 2.5 min
  const timeForRevision = () => !deadline || Date.now() + 150_000 < deadline;
  const meta = taskTypeMeta(type);
  if (!meta) throw new Error(`Neznámý typ úlohy ${type}`);
  const pool: Focus[] = simulatedPool ?? (dryRun ? [] : (await poolFocuses(exam, type)).map((p) => p.focus));
  const steer = steering(type, count);
  const siblings: Focus[] = []; // accepted-so-far candidates of this batch (they run in parallel)
  const chartFirst = type === "data" ? (dryRun ? Math.random() < 0.5 : await preferChart(exam)) : false;

  const lessons: Lessons | null = dryRun ? null : await getLessons(type).catch(() => null);

  const jobs = Array.from({ length: count }, async (_, i) => {
    const { examples, text: examplesText } = examplesFor(exam, type);
    const prompt = generatorPrompt({ type, examplesText, lessons, pool, steer: steer[i], variant: i, chartFirst });

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
          system: [{ type: "text", text: systemsFor(exam).generator, cache_control: { type: "ephemeral" } }],
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
        const repetition = simulatedPool
          ? repetitionIssue(type, focus, simulatedPool, siblings)
          : dryRun
            ? ""
            : repetitionIssue(type, focus, (await poolFocuses(exam, type)).map((p) => p.focus), siblings);
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
