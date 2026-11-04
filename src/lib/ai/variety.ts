import "server-only";
import type { ExamId, TaskType } from "@/lib/content/types";
import { createAdminClient } from "@/lib/supabase/admin";

// Keeps the pool varied: what a task "is about" is reduced to a fingerprint, so the generator can avoid
// words/topics that are already used, and practice never serves near-identical tasks back to back.

/** What a task revolves around. Words are stored as crude Czech stems, so "střízlivý" = "střízlivého". */
export interface Focus {
  /** The tested expression itself: the underlined word (synonyma), the given words (analogie). */
  head: string[];
  /** Readable form of head, for prompts and reports. */
  headWords: string[];
  /** Stems of the key concepts the task stands on (generator's `focus` field). */
  terms: string[];
  /** Stems of the topic words. */
  topic: string[];
  topicText: string;
  focusText: string[];
}

/** The underlined synonym word must not repeat anywhere in the pool; other types compare with recent tasks only. */
const wholePool = (type: TaskType) => type === "synonyma" || type === "aj_wordform";

const STOP = new Set(["který", "která", "které", "jejich", "mezi", "nebo", "proto", "jako", "také", "však", "jeho", "této", "tento", "podle", "úloha", "úlohy"]);

const ENDING = /(ovat|ého|ému|ých|ými|ách|ami|ové|ovi|ila|ili|ilo|ala|ali|alo|uje|ou|ým|ím|ech|em|ům|it|at|et|ět|il|al|ů|y|a|e|é|i|í|o|u|ý|ě)$/;
/** Crude Czech stem: drop a common ending, keep at most 6 letters ("střízlivý", "střízlivého" → "střízl"). */
const stem = (w: string) => {
  const cut = w.replace(ENDING, "");
  return (cut.length >= 3 ? cut : w).slice(0, 6);
};
function stems(text: string, minLen = 4) {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  return [...new Set(words.filter((w) => w.length >= minLen && !STOP.has(w)).map(stem))];
}

/** Words the task tests directly, straight from its text (works for old tasks without `focus`, too). */
function headWordsOf(type: TaskType, stem0: string) {
  if (type === "synonyma") return [...stem0.matchAll(/<u>(.*?)<\/u>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim()).filter(Boolean);
  if (type === "analogie") return (stem0.match(/\p{Lu}{3,}/gu) ?? []).map((w) => w.toLowerCase());
  // the base word in brackets at the end, e.g. "(VIOLENCE)"
  if (type === "aj_wordform") return [...stem0.matchAll(/\(([A-Z][A-Z'-]+)\)/g)].slice(-1).map((m) => m[1].toLowerCase());
  if (type === "aj_grammar") return [...stem0.matchAll(/<u>(.*?)<\/u>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim()).filter(Boolean);
  return [];
}

export function focusOf(type: TaskType, p: { topic?: string | null; focus?: string[] | null; stem?: string | null }): Focus {
  const headWords = headWordsOf(type, p.stem ?? "");
  const focusText = (p.focus ?? []).map((f) => f.trim()).filter(Boolean);
  return {
    head: [...new Set(headWords.flatMap((w) => stems(w, 3)))],
    headWords,
    terms: [...new Set(focusText.flatMap((f) => stems(f)))],
    topic: stems(p.topic ?? ""),
    topicText: p.topic ?? "",
    focusText,
  };
}

const overlap = (a: string[], b: string[]) => a.filter((x) => b.includes(x)).length;
const jaccard = (a: string[], b: string[]) => (a.length && b.length ? overlap(a, b) / new Set([...a, ...b]).size : 0);

/**
 * Same tested word, essentially the same topic, or the same principle on a similar topic – teaches nothing new.
 * `generic` stems (what most tasks of the type share anyway) don't count as a match.
 */
export function nearDuplicate(a: Focus, b: Focus, generic: Set<string> = new Set()) {
  const keep = (xs: string[]) => xs.filter((x) => !generic.has(x));
  const [at, bt, aTopic, bTopic] = [keep(a.terms), keep(b.terms), keep(a.topic), keep(b.topic)];
  return (
    overlap(a.head, b.head) > 0 ||
    jaccard(aTopic, bTopic) >= 0.5 ||
    (overlap(at, bt) >= 2 && overlap(aTopic, bTopic) >= 1)
  );
}

/** A stem in at least this share of a type's recent tasks says nothing about a task in particular. */
const GENERIC_SHARE = 0.25;
const GENERIC_MIN_POOL = 8;

/**
 * Stems that a large share of the pool shares – the principles every task of the type is built on ("pokud…, pak…",
 * "skrytý důsledek" in conditions, "procentní změna" in data) and stock topic words ("pořadí", "podle"). Two tasks
 * sharing only those are not repetitions; counting them rejected many good tasks of the maths and logic types.
 */
export function genericStems(pool: Focus[]) {
  const generic = new Set<string>();
  if (pool.length < GENERIC_MIN_POOL) return generic;
  const df = new Map<string, number>();
  for (const f of pool) for (const x of new Set([...f.terms, ...f.topic])) df.set(x, (df.get(x) ?? 0) + 1);
  for (const [x, k] of df) if (k / pool.length >= GENERIC_SHARE) generic.add(x);
  return generic;
}

/** Looser: shares a word or concept. Fine somewhere in the pool, but not right after each other. */
export function related(a: Focus, b: Focus) {
  return overlap(a.head, b.head) > 0 || overlap(a.terms, b.terms) >= 1 || overlap(a.topic, b.topic) >= 2;
}

const FOCUS_COLUMNS =
  "id,created_at,task_type,topic:payload->>topic,focus:payload->focus,stem:payload->questions->0->>stem,family:payload->>family,easy:payload->easy";
type FocusRow = {
  id: string;
  created_at: string;
  task_type: string;
  topic: string | null;
  focus: string[] | null;
  stem: string | null;
  family: string | null;
  easy: boolean | null;
};

/** A pool task's fingerprint. `family` is the task a variant was derived from – an original task is its own family. */
export interface PoolEntry {
  id: string;
  focus: Focus;
  family: string;
}

/** Fingerprints of pool tasks of a type, newest first. Synonyma load the whole pool (their words never repeat). */
export async function poolFocuses(exam: ExamId, type: TaskType): Promise<PoolEntry[]> {
  const { data } = await createAdminClient()
    .from("generated_tasks")
    .select(FOCUS_COLUMNS)
    .eq("exam", exam)
    .eq("task_type", type)
    .order("created_at", { ascending: false })
    .limit(wholePool(type) ? 2000 : 60);
  return ((data ?? []) as unknown as FocusRow[]).map((r) => ({ id: r.id, focus: focusOf(type, r), family: r.family ?? r.id }));
}

/** One generated task a user was served. */
export interface Served {
  id: string;
  /** When it was served. */
  at: string;
  family: string;
  easy: boolean;
  focus: Focus;
}

/** How many recently served tasks the history looks at (enough for the family and easy-task spacing rules). */
const HISTORY = 150;

/** The generated tasks of a type this user was served most recently, newest first. */
export async function servedHistory(userId: string, type: TaskType): Promise<Served[]> {
  const admin = createAdminClient();
  const { data: seen } = await admin
    .from("task_seen")
    .select("task_ref,created_at")
    .eq("user_id", userId)
    .like("task_ref", "gen:%")
    .order("created_at", { ascending: false })
    .limit(HISTORY);
  const refs = ((seen ?? []) as { task_ref: string; created_at: string }[])
    .map((s) => ({ id: s.task_ref.split(":")[1], at: s.created_at }))
    .filter((s) => s.id);
  if (!refs.length) return [];
  // id lists go into the URL – query in chunks
  const ids = refs.map((r) => r.id);
  const chunks = Array.from({ length: Math.ceil(ids.length / 75) }, (_, i) => ids.slice(i * 75, i * 75 + 75));
  const rows = (
    await Promise.all(chunks.map((c) => admin.from("generated_tasks").select(FOCUS_COLUMNS).in("id", c)))
  ).flatMap((r) => (r.data ?? []) as unknown as FocusRow[]);
  const byId = new Map(rows.filter((r) => r.task_type === type).map((r) => [r.id, r]));
  return refs.flatMap((s) => {
    const r = byId.get(s.id);
    return r ? [{ id: r.id, at: s.at, family: r.family ?? r.id, easy: r.easy === true, focus: focusOf(type, r) }] : [];
  });
}

/**
 * Reorders candidates so that the first ones are unrelated to what the user just saw and to each other.
 * Related candidates are not dropped, only moved back (better a similar task than none).
 */
export function diversify<T>(candidates: T[], focus: (c: T) => Focus, recent: Focus[]) {
  return split(candidates, focus, recent).flat();
}

/** [candidates unrelated to the recent ones and to each other, the related rest] */
export function split<T>(candidates: T[], focus: (c: T) => Focus, recent: Focus[]): [T[], T[]] {
  const picked: T[] = [];
  const rest: T[] = [];
  const taken = [...recent];
  for (const c of candidates) {
    const f = focus(c);
    if (taken.some((t) => related(f, t))) rest.push(c);
    else {
      picked.push(c);
      taken.push(f);
    }
  }
  return [picked, rest];
}

// ------------------------------------------------------------------ generator steering

/** Areas of life the generator is pointed at, a different one for each parallel candidate. */
export const DOMAINS = [
  "příroda a ekologie", "dějiny", "technika a vynálezy", "medicína a zdraví", "ekonomika a peníze", "sport",
  "výtvarné umění", "právo a úřady", "psychologie a mezilidské vztahy", "každodenní život v domácnosti", "doprava",
  "zemědělství a venkov", "vesmír a astronomie", "literatura a jazyk", "politika a veřejný život", "jídlo a vaření",
  "architektura a města", "hudba a divadlo", "škola a vzdělávání", "cestování a zeměpis", "práce a podnikání",
  "chemie a materiály", "počasí a klima", "film, média a internet", "zvířata", "řemesla", "armáda a bezpečnost",
  "náboženství a filozofie", "móda a odívání", "věda a výzkum",
];

const WORD_CLASSES = ["přídavné jméno", "sloveso", "podstatné jméno", "příslovce", "sloveso", "přídavné jméno"];

/** Random distinct picks for a batch of `count` candidates. */
export function steering(type: TaskType, count: number) {
  const domains = [...DOMAINS].sort(() => Math.random() - 0.5);
  const offset = Math.floor(Math.random() * WORD_CLASSES.length);
  return Array.from({ length: count }, (_, i) => ({
    domain: domains[i % domains.length],
    wordClass: type === "synonyma" ? WORD_CLASSES[(offset + i) % WORD_CLASSES.length] : null,
  }));
}

/** Prompt block listing what is already used, so the generator picks something new. */
export function varietyBlock(type: TaskType, pool: Focus[]) {
  if (wholePool(type)) {
    const words = [...new Set(pool.flatMap((f) => f.headWords.map((w) => w.toLowerCase())))].slice(0, 250);
    if (!words.length) return "";
    if (type === "aj_wordform")
      return `VÝCHOZÍ SLOVA (v závorce), KTERÁ UŽ V DATABÁZI JSOU – zvol jiné výchozí slovo (opakované bude automaticky zamítnuto):
${words.join(", ")}
`;
    return `SLOVA, KTERÁ UŽ V DATABÁZI JSOU – podtržený výraz NESMÍ být žádné z nich ani jeho tvar či odvozenina
(úloha s opakovaným slovem bude automaticky zamítnuta; uživatel se má pokaždé naučit nové slovo):
${words.join(", ")}
`;
  }
  const recent = pool
    .slice(0, 30)
    .map((f) => [f.headWords.join(" : ").toUpperCase(), f.topicText, f.focusText.length ? `(${f.focusText.join(", ")})` : ""].filter(Boolean).join(" "))
    .filter((t) => t.trim());
  if (!recent.length) return "";
  return `NEDÁVNÉ ÚLOHY TOHOTO TYPU – zvol jiné téma A jiný princip/chyták než všechny tyto (téměř stejná úloha bude zamítnuta):
- ${recent.join("\n- ")}
`;
}

/** Stems a word would have as the tested expression – to filter word proposals against the pool. */
export const wordStems = (word: string) => stems(word, 3);

/**
 * Members of one family share the principle on purpose, so they are not checked against each other like unrelated
 * tasks – but a variant must still be set in another context than every other member of its family.
 */
export function familyIssue(f: Focus, members: Focus[]) {
  const hit = members.find((m) => jaccard(f.topic, m.topic) >= 0.4 || overlap(f.head, m.head) > 0);
  return hit ? `opakování: varianta má skoro stejné téma jako úloha, ze které vychází („${hit.topicText}“) – zvol jiný kontext` : "";
}

/** Why a new task is too similar to the pool or its batch siblings (empty = fine). */
export function repetitionIssue(type: TaskType, f: Focus, pool: Focus[], siblings: Focus[]) {
  const others = [...siblings, ...(wholePool(type) ? pool : pool.slice(0, 30))];
  const generic = genericStems(pool.slice(0, 60));
  const hit = others.find((o) => nearDuplicate(f, o, generic));
  if (!hit) return "";
  if (overlap(f.head, hit.head))
    return `opakování: slovo „${f.headWords.join(", ")}“ už je v jiné úloze (${hit.headWords.join(", ")}) – zvol úplně jiné slovo z jiné oblasti`;
  return `opakování: téměř stejná úloha už existuje („${hit.topicText}“${hit.focusText.length ? `; ${hit.focusText.join(", ")}` : ""}) – zvol jiné téma a jiný princip`;
}
