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
const wholePool = (type: TaskType) => type === "synonyma";

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

/** Same tested word, essentially the same topic, or the same principle on a similar topic – teaches nothing new. */
export function nearDuplicate(a: Focus, b: Focus) {
  return (
    overlap(a.head, b.head) > 0 ||
    jaccard(a.topic, b.topic) >= 0.5 ||
    (overlap(a.terms, b.terms) >= 2 && overlap(a.topic, b.topic) >= 1)
  );
}

/** Looser: shares a word or concept. Fine somewhere in the pool, but not right after each other. */
export function related(a: Focus, b: Focus) {
  return overlap(a.head, b.head) > 0 || overlap(a.terms, b.terms) >= 1 || overlap(a.topic, b.topic) >= 2;
}

const FOCUS_COLUMNS = "id,created_at,topic:payload->>topic,focus:payload->focus,stem:payload->questions->0->>stem";
type FocusRow = { id: string; created_at: string; topic: string | null; focus: string[] | null; stem: string | null };

/** Fingerprints of pool tasks of a type, newest first. Synonyma load the whole pool (their words never repeat). */
export async function poolFocuses(exam: ExamId, type: TaskType) {
  const { data } = await createAdminClient()
    .from("generated_tasks")
    .select(FOCUS_COLUMNS)
    .eq("exam", exam)
    .eq("task_type", type)
    .order("created_at", { ascending: false })
    .limit(wholePool(type) ? 2000 : 60);
  return ((data ?? []) as unknown as FocusRow[]).map((r) => ({ id: r.id, focus: focusOf(type, r) }));
}

/** Fingerprints of the generated tasks of a type this user was served most recently (newest first). */
export async function recentlySeenFocuses(userId: string, type: TaskType, limit = 6) {
  const admin = createAdminClient();
  const { data: seen } = await admin
    .from("task_seen")
    .select("task_ref,created_at")
    .eq("user_id", userId)
    .like("task_ref", "gen:%")
    .order("created_at", { ascending: false })
    .limit(40);
  const ids = ((seen ?? []) as { task_ref: string }[]).map((s) => s.task_ref.split(":")[1]).filter(Boolean);
  if (!ids.length) return [];
  const { data } = await admin.from("generated_tasks").select(FOCUS_COLUMNS).in("id", ids).eq("task_type", type);
  const byId = new Map(((data ?? []) as unknown as FocusRow[]).map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is FocusRow => Boolean(r))
    .slice(0, limit)
    .map((r) => focusOf(type, r));
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

/** Why a new task is too similar to the pool or its batch siblings (empty = fine). */
export function repetitionIssue(type: TaskType, f: Focus, pool: Focus[], siblings: Focus[]) {
  const others = [...siblings, ...(wholePool(type) ? pool : pool.slice(0, 30))];
  const hit = others.find((o) => nearDuplicate(f, o));
  if (!hit) return "";
  if (overlap(f.head, hit.head))
    return `opakování: slovo „${f.headWords.join(", ")}“ už je v jiné úloze (${hit.headWords.join(", ")}) – zvol úplně jiné slovo z jiné oblasti`;
  return `opakování: téměř stejná úloha už existuje („${hit.topicText}“${hit.focusText.length ? `; ${hit.focusText.join(", ")}` : ""}) – zvol jiné téma a jiný princip`;
}
