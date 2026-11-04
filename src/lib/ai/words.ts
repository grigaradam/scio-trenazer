import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { TaskType } from "@/lib/content/types";
import { AI } from "@/lib/env";
import { anthropic } from "./client";
import type { AiStage } from "./usage";
import { wordStems, type Focus } from "./variety";
import type Anthropic from "@anthropic-ai/sdk";

// Synonym and word-formation tasks must test a word the pool doesn't have yet. The generator can only be shown a few
// hundred of the used words, while the repetition check knows all of them – so the bigger the pool, the more finished
// tasks were thrown away for an "invisible" repeat. Instead a cheap model proposes fresh words, code drops every word
// the pool already has, and the generator picks one of the rest.

export const needsWords = (type: TaskType) => type === "synonyma" || type === "aj_wordform";
/** How many unused words each candidate is offered. */
export const WORDS_PER_TASK = 6;

const CZ_CLASSES = ["přídavné jméno", "sloveso", "podstatné jméno", "příslovce"] as const;
const CzSchema = z.object({ words: z.array(z.object({ word: z.string(), wordClass: z.enum(CZ_CLASSES) })) });
const EnSchema = z.object({ words: z.array(z.string()) });
const CZ_FORMAT = zodOutputFormat(CzSchema);
const EN_FORMAT = zodOutputFormat(EnSchema);

const letters = (alphabet: string, n: number) =>
  [...alphabet]
    .sort(() => Math.random() - 0.5)
    .slice(0, n)
    .join(", ");

function prompt(type: TaskType) {
  if (type === "aj_wordform")
    return `Suggest base words for "word formation" tasks of the Scio English test (level B2–C1). Each task is a sentence with one gap
and the base word in capitals at its end, e.g. "She was completely ______ of the danger. (AWARE)" → UNAWARE.
Requirements for every base word:
- a real, frequent English word (B1–C1) whose derived form commonly appears in such tasks (prefixes un-, in-, dis-, mis-, ir-;
  suffixes -tion, -ment, -ness, -ity, -ance, -ive, -ous, -able, -al, -ful, -less, -ly, -ise …);
- the derivation is regular and unambiguous; no proper nouns, abbreviations or compounds.
Write 40 different base words in CAPITALS, mixed nouns, verbs and adjectives, most of them starting with one of these letters: ${letters("abcdefghilmnoprstuvw", 7)}.`;
  return `Navrhni slova pro úlohy „Synonyma a antonyma“ testu OSP společnosti Scio. Slovo bude ve větě podtržené a student k němu hledá
synonymum (význam ve větě) a antonymum. Požadavky na každé slovo:
- skutečné spisovné české slovo v základním tvaru (podstatné a přídavné jméno v 1. pádě jednotného čísla, sloveso v infinitivu);
- střední až vyšší obtížnost: vzdělaný dospělý ho zná, ale není triviální (ne „velký“, „dobrý“, „jít“);
- má jednoznačné synonymum i jednoznačné antonymum;
- žádná vlastní jména, zkratky, zdrobněliny, hovorová ani zastaralá slova, žádná víceslovná spojení.
Napiš 16 přídavných jmen, 16 sloves, 12 podstatných jmen a 10 příslovcí; většina ať začíná na jedno z písmen: ${letters("abcdhjklmnoprstuvz", 7)}.`;
}

const CZ_WORD = /^\p{L}[\p{L}-]{2,23}$/u;
const EN_WORD = /^[A-Z][A-Z'-]{1,29}$/;

/**
 * For each candidate a list of WORDS_PER_TASK words that are not in the pool yet (null = no proposal; the generator
 * then falls back to the list of used words). `wordClasses` = the word class each synonym candidate should test.
 */
export async function freshWords(
  type: TaskType,
  pool: Focus[],
  wordClasses: (string | null)[],
  log: (o: { kind: "words"; model: string; usage: Anthropic.Usage; ok: boolean; stage: AiStage }) => Promise<void>,
): Promise<(string[] | null)[]> {
  const none = wordClasses.map(() => null);
  if (!needsWords(type) || !wordClasses.length) return none;
  try {
    const aj = type === "aj_wordform";
    const response = await anthropic().messages.create({
      model: AI.wordsModel,
      max_tokens: 6000,
      output_config: { effort: "low", format: { type: "json_schema", schema: (aj ? EN_FORMAT : CZ_FORMAT).schema } },
      messages: [{ role: "user", content: prompt(type) }],
    });
    const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const proposed: { word: string; wordClass: string | null }[] = aj
      ? EN_FORMAT.parse(text).words.map((w) => ({ word: w.trim().toUpperCase(), wordClass: null }))
      : CZ_FORMAT.parse(text).words.map((w) => ({ word: w.word.trim().toLowerCase(), wordClass: w.wordClass }));
    await log({ kind: "words", model: AI.wordsModel, usage: response.usage, ok: true, stage: "words" });

    // drop words whose stem the pool (or an earlier proposal) already has
    const taken = new Set(pool.flatMap((f) => f.head));
    const fresh: typeof proposed = [];
    for (const p of proposed) {
      if (!(aj ? EN_WORD : CZ_WORD).test(p.word)) continue;
      const stems = wordStems(p.word.toLowerCase());
      if (!stems.length || stems.some((s) => taken.has(s))) continue;
      stems.forEach((s) => taken.add(s));
      fresh.push(p);
    }
    // hand out: a synonym candidate gets words of its word class first
    return wordClasses.map((cls) => {
      const own = fresh.filter((p) => !cls || p.wordClass === cls);
      const pick = [...own, ...fresh.filter((p) => !own.includes(p))].slice(0, WORDS_PER_TASK);
      pick.forEach((p) => fresh.splice(fresh.indexOf(p), 1));
      return pick.length >= 3 ? pick.map((p) => p.word) : null;
    });
  } catch (e) {
    console.error("freshWords", e);
    return none;
  }
}

/** Prompt block: pick the tested word from these unused ones. */
export function wordsBlock(type: TaskType, words: string[]) {
  if (type === "aj_wordform")
    return `VÝCHOZÍ SLOVO (v závorce na konci věty) vyber z těchto slov, která v databázi ještě nejsou: ${words.join(", ")}.
Zvol to, ke kterému se nejlépe hodí přirozená věta a jednoznačná odvozenina. Jiné výchozí slovo nepoužívej – opakované slovo se automaticky zamítá.`;
  return `PODTRŽENÝ VÝRAZ vyber z těchto slov, která v databázi ještě nejsou: ${words.join(", ")}.
Zvol to, ke kterému nejlépe sedí přesné synonymum i antonymum s věrohodnými chytáky (ve větě ho můžeš vyskloňovat či vyčasovat).
Jiné slovo nepoužívej – opakované slovo se automaticky zamítá.`;
}
