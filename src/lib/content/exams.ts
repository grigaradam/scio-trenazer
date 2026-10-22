import type { ExamId, SectionId, TaskType } from "./types";

export interface ExamMeta {
  id: ExamId;
  name: string;
  short: string;
  enabled: boolean;
  description: string;
  emoji: string;
}

/** Registry of exams. Adding ZSV/AJ later = add content + flip `enabled`. */
export const EXAMS: ExamMeta[] = [
  {
    id: "osp",
    name: "Obecné studijní předpoklady",
    short: "OSP",
    enabled: true,
    description: "Verbální a analytický oddíl, 66 úloh, 85 minut.",
    emoji: "🧠",
  },
  {
    id: "zsv",
    name: "Základy společenských věd",
    short: "ZSV",
    enabled: false,
    description: "Připravujeme.",
    emoji: "🏛️",
  },
  {
    id: "aj",
    name: "Anglický jazyk",
    short: "AJ",
    enabled: false,
    description: "Připravujeme.",
    emoji: "🇬🇧",
  },
  {
    id: "mat",
    name: "Matematika",
    short: "MAT",
    enabled: false,
    description: "Připravujeme.",
    emoji: "📐",
  },
];

export const SECTION_META: Record<SectionId, { title: string; short: string; minutes: number }> = {
  verbal: { title: "Verbální oddíl", short: "Verbální", minutes: 35 },
  analytic: { title: "Analytický oddíl", short: "Analytický", minutes: 50 },
};

export interface TaskTypeMeta {
  id: TaskType;
  exam: ExamId;
  section: SectionId;
  name: string;
  emoji: string;
  description: string;
  /** How many questions a generated practice group contains. */
  groupSize: number;
  /** Rules for the AI generator, distilled from real Scio tasks. */
  rules: string;
  /** Typical Scio traps for this type – the generator must build them in, the validator checks them. */
  traps: string;
}

export const TASK_TYPES: TaskTypeMeta[] = [
  {
    id: "doplnovani",
    exam: "osp",
    section: "verbal",
    name: "Doplňování do vět",
    emoji: "✍️",
    description: "Vyber dvojici/trojici slov, která se do věty významově i stylisticky hodí nejlépe.",
    groupSize: 1,
    rules:
      "Krátký souvislý text (1–3 věty, publicistický/odborný styl) se 2–3 vynechanými místy ______. " +
      "4 možnosti, každá je dvojice nebo trojice slov oddělených pomlčkou „ – “ ve správném tvaru. " +
      "Právě jedna možnost dává smysl ve všech mezerách zároveň; distraktory sedí jen v části mezer, " +
      "porušují logiku věty (např. spojka vyjadřuje špatný vztah) nebo styl. Pozor na shodu a pády.",
    traps:
      "Všechny 4 možnosti jsou gramaticky správné a znějí přirozeně; distraktory sedí do jedné mezery perfektně, ale ve druhé jemně narušují význam, kolokaci nebo logiku spojky (přípustka vs. příčina, časová souslednost). Správná odpověď nesmí jít poznat jen z první mezery – rozhoduje až souvislost celé věty.",
  },
  {
    id: "analogie",
    exam: "osp",
    section: "verbal",
    name: "Slovní analogie",
    emoji: "🔗",
    description: "Doplň dvojici tak, aby vztah vpravo odpovídal vztahu vlevo (na pořadí záleží).",
    groupSize: 1,
    rules:
      "Zadání ve tvaru „SLOVO : ______ = ______ : SLOVO“ (velkými písmeny, mezery ______ mohou být na různých místech). " +
      "4 možnosti ve tvaru „slovo – slovo“ (malými písmeny). Vztah musí být jednoznačný (část–celek, nástroj–činnost, " +
      "příčina–následek, protiklad, stupňování, osoba–místo…) a pořadí v obou dvojicích stejné. " +
      "Distraktory tvoří podobné, ale jiné vztahy nebo obrácené pořadí.",
    traps:
      "Distraktory jsou ze stejné tematické oblasti jako zadání, ale mají jiný vztah (část–celek místo nástroj–činnost), obrácené pořadí, nebo vztah platí jen volně. Aspoň jeden distraktor musí být na první pohled lákavější než správná odpověď. Vztah musí jít přesně pojmenovat, aby byl jednoznačný.",
  },
  {
    id: "synonyma",
    exam: "osp",
    section: "verbal",
    name: "Synonyma a antonyma",
    emoji: "🔁",
    description: "Najdi výraz nejbližší významem podtrženému slovu v kontextu věty a výraz opačného významu.",
    groupSize: 1,
    rules:
      "Jedna věta s jedním podtrženým výrazem <u>…</u> (často méně běžné, knižní nebo expresivní slovo). " +
      "Dvě části: synonymum (možnosti A–D) a antonymum (možnosti E–H), každá ve stejném slovním druhu a tvaru jako podtržený výraz. " +
      "Synonymum i antonymum musí být skutečná existující česká slova a vztah musí platit V KONTEXTU věty. " +
      "Distraktory: slova tematicky blízká, ale s jiným významem, nebo synonyma jiného významu mnohoznačného slova.",
    traps:
      "Podtržený výraz je méně běžný, knižní nebo mnohoznačný a jeho význam určuje až kontext věty. Mezi distraktory synonyma je synonymum JINÉHO významu téhož slova a slovo tematicky blízké; mezi distraktory antonyma je slovo opačné k jinému významu a slovo jen oslabující význam. Žádná odpověď nesmí být zřejmá bez porozumění kontextu.",
  },
  {
    id: "nesoulad",
    exam: "osp",
    section: "verbal",
    name: "Nesoulad v textu",
    emoji: "🧩",
    description: "Najdi část textu, která nezapadá do jeho celkového vyznění.",
    groupSize: 1,
    rules:
      "Odstavec 5–8 vět populárně-naučného textu. Právě jedna věta je v rozporu s celkovým vyzněním (protiřečí ostatním, " +
      "obrací logiku, např. 'snadné' vs. zbytek tvrdí 'náročné'). Otázka: „Která z následujících částí uvedeného textu " +
      "není v souladu s jeho celkovým vyzněním?“ 4 možnosti = doslovné citace 4 vět z textu.",
    traps:
      "Nesouladná věta není mimo téma – je jemná: jedním slovem obrací hodnocení (snadné × náročné), obrací příčinu a následek nebo tvrdí opak závěru. Ostatní nabízené věty musí také působit podezřele (obsahují silná slova, čísla, zdánlivé odbočky), aby nesoulad nešel najít povrchně.",
  },
  {
    id: "vyplyvani",
    exam: "osp",
    section: "verbal",
    name: "Vyplývání z textu",
    emoji: "🔍",
    description: "Urči, co z krátkého textu skutečně vyplývá – nic víc, nic míň.",
    groupSize: 1,
    rules:
      "Krátký text 4–7 řádků (zpravodajský/naučný). Buď otázka „Které z následujících tvrzení vyplývá z uvedeného textu?“ " +
      "se 4 tvrzeními, nebo „Které/á z následujících tvrzení vyplývá/ají…“ se třemi výroky 1) 2) 3) a možnostmi typu " +
      "„jen 1“, „1 a 2“, „žádné“. Správné tvrzení musí z textu plynout nutně; distraktory přehánějí (všechny, vždy, nejvíce), " +
      "zaměňují příčinu a následek nebo přidávají informace navíc.",
    traps:
      "Distraktory: tvrzení pravdivé ve skutečném světě, ale z textu neplynoucí; zobecnění (vždy, všichni, nejvíce); záměna nutné a postačující podmínky; posun kvantifikátoru nebo čísla; záměna příčiny a korelace. U typu s výroky 1) 2) 3) musí být aspoň jeden výrok téměř správný s jedním jemně chybným detailem.",
  },
  {
    id: "porozumeni",
    exam: "osp",
    section: "verbal",
    name: "Porozumění delšímu textu",
    emoji: "📖",
    description: "Delší text a několik otázek na jeho porozumění.",
    groupSize: 3,
    rules:
      "Publicistický/odborný text 4–5 odstavců (cca 300–400 slov). 3 otázky typu: co z textu vyplývá, jak se liší situace, " +
      "co je prezentováno jako domněnka, nejvhodnější nadpis, funkce určité části textu. Odpovědi jen na základě textu.",
    traps:
      "Otázky vyžadují úsudek, ne vyhledání věty: rozlišení faktu a domněnky, postoje autora, funkce odstavce, nejpřesnějšího shrnutí. Distraktory jsou z části pravdivé, ale přehánějí, zužují nebo přidávají informaci, která v textu není.",
  },
  {
    id: "dva_texty",
    exam: "osp",
    section: "verbal",
    name: "Srovnání dvou textů",
    emoji: "⚖️",
    description: "Dva texty na stejné téma – vztah mezi nimi, postoje autorů, co platí pro oba.",
    groupSize: 3,
    rules:
      "Dva názorové texty (Text 1, Text 2, každý 150–250 slov) na stejné téma s odlišnými postoji. 3 otázky: vztah textů " +
      "(reaguje / nezávislé), jak by autoři řešili problém, jak hodnotí jev, co vyplývá z obou textů.",
    traps:
      "Texty se liší jemně (souhlasí v cíli, liší se v prostředcích nebo míře). Distraktory zaměňují postoje autorů, tvrdí shodu tam, kde je jen částečná, nebo přisuzují jednomu textu tvrzení druhého. Otázka „co plyne z obou“ musí mít lákavý distraktor, který plyne jen z jednoho.",
  },
  {
    id: "data",
    exam: "osp",
    section: "analytic",
    name: "Grafy a tabulky",
    emoji: "📊",
    description: "Čtení a výpočty z tabulek a grafů.",
    groupSize: 3,
    rules:
      "Společná data s krátkým popisem situace – buď jako GRAF (pole chart: sloupcový, skládaný, spojnicový nebo koláčový), " +
      "nebo jako Markdown tabulka v passage. 3 otázky: kolik / rozdíl / podíl / průměr / změna / v kterých případech platí " +
      "podmínka. Výpočty proveditelné bez kalkulačky. U grafu musí jít hodnoty přesně odečíst z mřížky.",
    traps:
      "Výpočty mají 2–3 kroky: procento z procenta, relativní vs. absolutní změna, průměr přes nestejné skupiny, podíl ze součtu více kategorií, porovnání meziročních změn. Distraktory odpovídají typickým chybám (špatný základ procenta, záměna řad nebo let, absolutní místo relativní změny, zapomenutá kategorie).",
  },
  {
    id: "porovnani",
    exam: "osp",
    section: "analytic",
    name: "Porovnávání hodnot",
    emoji: "↔️",
    description: "Porovnej hodnotu vlevo a vpravo – větší, menší, rovno, nebo nelze určit.",
    groupSize: 1,
    rules:
      "Volitelná společná informace (např. „Číslo x je celé kladné.“) a dva výrazy: vlevo a vpravo. Možnosti jsou vždy přesně: " +
      "A „Hodnota vlevo je větší než hodnota vpravo.“, B „Hodnota vpravo je větší než hodnota vlevo.“, " +
      "C „Hodnota vpravo je stejná jako hodnota vlevo.“, D „Nelze jednoznačně určit, která hodnota je větší.“ " +
      "Typické pasti: záporná čísla, nula, zlomky, procenta, věk, průměry. Ověř všechny přípustné hodnoty proměnné.",
    traps:
      "Pasti: záporná čísla, nula, zlomky mezi 0 a 1, necelá čísla, mocniny se zápornou bází, procenta z různých základů, věk v čase. Výrazy často vypadají různě, ale jsou si rovny, nebo intuice ukazuje opačně. Když je odpověď D, musí existovat konkrétní protipříklady; když není D, musí to platit pro VŠECHNY přípustné hodnoty, ač to tak na první pohled nevypadá.",
  },
  {
    id: "dostatecnost",
    exam: "osp",
    section: "analytic",
    name: "Dostatečnost údajů",
    emoji: "🧮",
    description: "Stačí uvedená tvrzení k jednoznačné odpovědi na otázku?",
    groupSize: 1,
    rules:
      "Otázka (+ případně úvodní informace) a dvě tvrzení „Tvrzení (1) …“ a „Tvrzení (2) …“. Možnosti vždy přesně: " +
      "A „Každé z tvrzení je samo o sobě dostačující.“, B „Právě jedno z tvrzení je samo o sobě dostačující.“, " +
      "C „Obě tvrzení dohromady jsou dostačující, ale ani jedno z tvrzení není samo o sobě dostačující.“, " +
      "D „Ani obě tvrzení dohromady nejsou dostačující.“ Odpověď musí být jednoznačně ověřitelná.",
    traps:
      "Jedno tvrzení vypadá dostačující, ale má skrytý případ (záporné číslo, nula, rovnost, neceločíselná hodnota, dvě řešení kvadratické rovnice); nebo naopak tvrzení vypadá nedostačující, ale ve spojení s úvodní informací stačí. Správně nesmí být vždy C. Kombinace musí být promyšlené.",
  },
  {
    id: "slovni",
    exam: "osp",
    section: "analytic",
    name: "Slovní úlohy",
    emoji: "🧠",
    description: "Praktické matematické úlohy – procenta, poměry, pohyb, kalendář, geometrie.",
    groupSize: 1,
    rules:
      "Slovní úloha (2–5 vět) řešitelná bez kalkulačky za 1–2 minuty: procenta, poměry, rychlost, práce, kalendář, " +
      "obvody/obsahy/objemy, růst/pokles. 4 číselné možnosti seřazené vzestupně, distraktory = výsledky typických chyb.",
    traps:
      "2–3 kroky výpočtu, řetězení procentních změn (zdražení a sleva ≠ původní cena), rychlost/čas/práce, společná práce, kalendář s chybou o jedna, poměry rozdělení. Distraktory = výsledky konkrétních typických chyb, všechny ve stejném řádu. Čísla musí jít spočítat bez kalkulačky.",
  },
  {
    id: "vyrazy",
    exam: "osp",
    section: "analytic",
    name: "Výrazy, funkce, operace",
    emoji: "➗",
    description: "Práce se vzorci, nově definovanými operacemi a funkcemi, převod textu na rovnici.",
    groupSize: 1,
    rules:
      "Typy: nově definovaná operace (např. $a \\# b = 2a - (b+1)$), funkce $f(x)$ a skládání, vztahy mezi proměnnými " +
      "ze slovního popisu („Který z následujících vztahů situaci vyjadřuje?“). Matematiku piš v KaTeX ($...$).",
    traps:
      "Nově definovaná operace s nekomutativním pořadím nebo zápornými čísly, skládání funkcí f(f(x)) či f(1/x), převod slovní situace na vztah s jemnou chybou v distraktorech (prohozené proměnné, chybějící závorka, záměna „o“ a „krát“).",
  },
  {
    id: "podminky",
    exam: "osp",
    section: "analytic",
    name: "Úsudky s podmínkami",
    emoji: "🧷",
    description: "Logické úlohy se souborem podmínek – kdo, kdy, kde.",
    groupSize: 3,
    rules:
      "Úvodní text: osoby/předměty a přiřazení (dny, místa, pořadí, počty), pak „Víme, že:“ a 3–5 podmínek jako seznam. " +
      "3 otázky typu: kdo může…, co je v rozporu s podmínkami, pokud by platilo X…, u koho lze jednoznačně určit. " +
      "Řešení musí být ověřeno úplným výčtem všech přípustných přiřazení.",
    traps:
      "5–6 objektů, 4–5 podmínek, z nichž některé jsou negativní nebo podmíněné („pokud…, pak…“). Otázky typu „co MUSÍ platit“, „co MŮŽE platit“, „co je v rozporu“, „pokud by platilo X…“, „u koho lze jednoznačně určit“. Distraktory platí v některých, ale ne ve všech přípustných rozmístěních. Ověř úplným výčtem.",
  },
];

export const taskTypeMeta = (id: string) => TASK_TYPES.find((t) => t.id === id);

export const taskTypesFor = (exam: ExamId, section?: SectionId) =>
  TASK_TYPES.filter((t) => t.exam === exam && (!section || t.section === section));
