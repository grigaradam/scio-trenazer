# Nanečisto – plán projektu

> Tento dokument je závazný plán. Všechno, co se staví, se drží tohoto souboru.
> Změny plánu se zapisují sem (sekce *Changelog* dole).

## 1. Cíl

Webová aplikace pro přípravu na Národní srovnávací zkoušky (Scio). Teď jen **OSP
(Obecné studijní předpoklady)**, ale architektura je připravená na další zkoušky
(ZSV, angličtina, matematika…) – stačí přidat definici zkoušky a obsah.

Hlavní myšlenky:

- **Reálná simulace testu** – přesně celé testy z minulých let, stejný čas, stejné bodování,
  oddíly za sebou, odpočet, automatické přepnutí oddílu.
- **Učení z chyb** – po testu přesný rozpis chyb → „zkus to přepočítat" → AI vysvětlení
  se zvýrazněním → chat s AI o konkrétní úloze.
- **Nekonečný trénink slabin** – AI generuje nové úlohy stejného typu (podle vzoru reálných
  úloh), každá projde kontrolou kvality, ukládá se do sdíleného poolu a recykluje se mezi uživateli
  (žádný uživatel nedostane stejnou úlohu dvakrát).
- **Motivace à la Duolingo** – XP, levely, denní streak, denní cíl, achievementy, heatmapa
  odučeného času, grafy zlepšení, porovnání testů.
- **Zdarma provoz** – Vercel Hobby + Supabase Free, platí se jen AI (Anthropic API).

## 2. Fakta o OSP (zdroj: scio.cz / scioexams.com, studie testů v `testy/`)

| | Verbální oddíl | Analytický oddíl |
|---|---|---|
| Počet úloh | 33 | 33 |
| Čas | **35 minut** | **50 minut** |
| Pořadí | 1. | 2. |

- Mezi oddíly se nesmí přeskakovat (po skončení verbálního se k němu už nevrací).
- Kalkulačka zakázána, počítá se na papíře.
- Každá úloha má právě jednu správnou odpověď (A–D).
- **Bodování** (odvozeno ze statistik testů: min. možné skóre −22 = 66 × −⅓):
  - správně **+1**, špatně **−⅓**, nevyplněno **0**;
  - úloha synonymum/antonymum = 2 poloviny: každá **+½ / −⅙**.
- Výsledek NSZ je percentil. Každý test v `testy/` má statistiky (průměr, medián, směrodatná
  odchylka, počet účastníků) → aplikace ukazuje **odhad percentilu** (normální aproximace).

### Typy úloh OSP (taxonomie aplikace)

Verbální oddíl:

| id | název | typicky úlohy |
|---|---|---|
| `doplnovani` | Doplňování do vět | 1–3 |
| `analogie` | Slovní analogie | 4–6 |
| `synonyma` | Synonyma a antonyma | 7–9 |
| `nesoulad` | Nesoulad v textu | 10–15 |
| `vyplyvani` | Vyplývání z krátkého textu | 16–23 |
| `porozumeni` | Porozumění delšímu textu | 24–29 |
| `dva_texty` | Srovnání dvou textů | 30–33 |

Analytický oddíl:

| id | název | typicky úlohy |
|---|---|---|
| `data` | Grafy a tabulky | 34–39 |
| `porovnani` | Porovnávání hodnot | 40–45 |
| `dostatecnost` | Dostatečnost údajů | 46–49 |
| `slovni` | Slovní úlohy | 50–55 |
| `vyrazy` | Výrazy, funkce, operace | 56–59 |
| `podminky` | Úsudky se soubory podmínek | 60–66 |

## 3. Obsah – testy z minulých let

Ve složce `testy/` je 15 souborů, ale některé jsou duplicity (`*-ZAD.pdf` = totéž zadání,
`T4_A.docx` = totéž co `T4_A.pdf`). **Unikátních testů je 10:**

| id | termín | varianta |
|---|---|---|
| `osp-2023-03-a` | Březen 2023 (T3) | A |
| `osp-2023-03-b` | Březen 2023 (T3) | B |
| `osp-2023-04-a` | Duben I 2023 (T4) | A |
| `osp-2023-04-b` | Duben I 2023 (T4) | B |
| `osp-2025-05-a` | Květen 2025 (T7) | A |
| `osp-2025-05-b` | Květen 2025 (T7) | B |
| `osp-2025-12-a` | Prosinec 2025 (T1) | A |
| `osp-2025-12-b` | Prosinec 2025 (T1) | B |
| `osp-2026-03-b` | Březen 2026 (T5) | B |
| `osp-2026-04-b` | Duben 2026 (T6) | B |

**PDF neobsahují klíč správných odpovědí** → správné odpovědi se musí vyřešit a ověřit.

Pipeline:
1. Extrakce textu z PDF (PyMuPDF) → hrubý parser → JSON.
2. Ruční kontrola: zlomky, mocniny, odmocniny → LaTeX (render KaTeX), tabulky → Markdown,
   grafy/obrázky → oříznuté PNG z PDF (`public/figures/<test>/<n>.png`).
3. Vyřešení všech úloh, zápis klíče do JSON, kontrolní skript (počty úloh, možnosti, klíč, figury).
4. **Klíč zůstává jen na serveru** – klient dostává zadání bez odpovědí, vyhodnocení probíhá na serveru.

Formát: `content/osp/tests/<id>.json` (viz `src/lib/content/types.ts`).

## 4. Technologie (rozhodnutí)

| Vrstva | Volba | Proč |
|---|---|---|
| Frontend + API | **Next.js (App Router) + TypeScript** | Vercel-native, server-side vyhodnocení, route handlery pro AI streaming |
| Styl | **Tailwind CSS** + vlastní komponenty, `motion` animace | rychlé, responzivní, hezké |
| Matematika | **KaTeX** | správné zlomky/mocniny |
| Grafy | **Recharts** | progres, heatmapa |
| DB + účty | **Supabase** (Postgres + Auth + RLS) | relační data (pokusy, pool úloh, „co už uživatel viděl") jsou v SQL výrazně jednodušší a levnější než ve Firestore; free tier 500 MB DB, 50k MAU |
| AI | **Anthropic Claude API** (`@anthropic-ai/sdk`) | vysvětlení, chat, generování + validace úloh |
| Hosting | **Vercel Hobby** (zdarma) | push na GitHub → auto deploy |

Proč ne Firebase: Firestore účtuje čtení dokumentů, dotazy typu „najdi úlohu typu X, kterou
uživatel ještě neviděl" jsou v NoSQL drahé a neohrabané. Supabase = jeden SQL dotaz.

Pozn.: Supabase Free projekt se po 7 dnech bez aktivity uspí (stačí ho odkliknout v dashboardu).

## 5. Datový model (Supabase)

- `profiles` – uživatel: jméno, zvolená zkouška, XP, streak (aktuální/nejlepší), poslední aktivní den, denní cíl (min), nastavení.
- `attempts` – pokus o celý test: test_id, stav (`in_progress`/`completed`), aktuální oddíl, zbývající čas po oddílech, odpovědi, pauzy, výsledky (skóre celkem / po oddílech / po typech, percentil), `is_diagnostic`.
- `mistakes` – chybné úlohy uživatele (z testů i tréninku): ref úlohy, typ, stav (`open` → `fixed`), počet pokusů.
- `generated_tasks` – sdílený pool AI úloh: zkouška, typ, payload (zadání + klíč + vysvětlení), skóre kvality, zdrojové vzory, model.
- `task_seen` – (uživatel, úloha) unikátně → úloha se uživateli nikdy neopakuje; zároveň log odpovědí v tréninku.
- `study_days` – (uživatel, den) → sekundy učení, počet úloh, XP → heatmapa + denní cíl.
- `achievements` – odemčené achievementy.
- `explanations` – cache AI vysvětlení pro originální úlohy (sdílené mezi uživateli → šetří tokeny).
- `ai_usage` – denní počítadlo AI volání na uživatele (ochrana rozpočtu).

Všechny tabulky s RLS („uživatel vidí jen své"), sdílené tabulky (`generated_tasks`, `explanations`) čte i zapisuje jen server (service role).

## 6. Funkce a obrazovky

1. **Landing** – co to je, CTA registrace.
2. **Registrace / přihlášení** – e-mail + heslo (Supabase Auth).
3. **Onboarding** – výběr zkoušky (OSP aktivní; ZSV, AJ, MAT „brzy"), denní cíl, → **úvodní (diagnostický) test**.
4. **Test runner**
   - verbální (fialová) a analytický (tyrkysová) oddíl vizuálně oddělené, mezistránka mezi oddíly;
   - odpočet 35:00 / 50:00, varování při 5 min a 1 min, po vypršení automatické přepnutí / odevzdání;
   - navigátor úloh (vyplněné / označené vlajkou), společné texty u skupin úloh;
   - **pauza** (zastaví čas, zakryje zadání);
   - průběžné ukládání → při zavření okna varování, ale lze odejít a pokračovat později;
     dashboard pak připomíná „Máš rozdělaný test – dokonči ho";
   - předčasné ukončení oddílu (s potvrzením).
5. **Výsledky** – skóre, oddíly, odhad percentilu, úspěšnost po typech, konfety + XP,
   srovnání s minulým testem (co se zlepšilo / zhoršilo), seznam chyb.
6. **Rozbor úlohy** – „Chceš to zkusit přepočítat?" (nový pokus bez prozrazení) → správná odpověď
   → **AI vysvětlení** se žlutým zvýrazněním klíčových míst (animované „zvýrazňovačem")
   → **chat s AI** o úloze („proč ne B?").
7. **Moje slabiny** – úlohy, které nešly, seskupené podle typu; denní doporučení; trénink.
8. **Trénink** – výběr typu (doporučené = slabé typy), časový limit na úlohu (bez limitu / 1 / 2 / 3 min / vlastní),
   nekonečný přísun úloh: nejdřív nevyřešené chyby, pak pool AI úloh, dogenerování při nedostatku.
9. **Pokrok** – heatmapa denního času, graf skóre testů, mastery po typech, historie pokusů (otevřít a projít zpětně).
10. **Achievementy** a **profil** (denní cíl, jméno, odhlášení).

## 7. AI (Anthropic)

- **Model**: konfigurovatelný přes env (`AI_MODEL`, výchozí `claude-opus-5-5`); pro úsporu lze dát
  `claude-haiku-5-5` (~40× levnější). Validátor může běžet na jiném modelu (`AI_VALIDATOR_MODEL`).
- **Vysvětlení** – strukturovaný výstup (kroky, klíčová myšlenka, past/chyták, tip). Zvýraznění `==text==`
  → žlutý zvýrazňovač s animací. Cache v DB pro originální úlohy.
- **Chat** – streamovaný, kontext = zadání, klíč, odpověď uživatele, vysvětlení. Sokratovský styl: nejdřív navést.
- **Generování** – few-shot: 3–4 reálné úlohy stejného typu z databáze testů jako vzor, pravidla typu,
  zákaz kopírování, povinná obměna tématu. Výstup přes structured outputs (JSON schema).
- **Kontrola kvality (2 stupně)**:
  1. programová: formát, 4 různé možnosti, klíč existuje, délky, žádné duplicity s poolem;
  2. **nezávislý AI validátor**: úlohu vyřeší bez znalosti klíče → musí se shodovat; hodnotí jednoznačnost,
     gramatickou správnost češtiny, reálnost synonym/antonym, obtížnost a styl vs. Scio (1–10).
     Přijato jen pokud se shoduje odpověď a všechna kritéria ≥ 7. Jinak zahozeno.
- **Rozpočet**: denní limit AI volání na uživatele (env), cache vysvětlení, recyklace úloh mezi uživateli.

### Didaktické principy (podložené výzkumem)

- **Retrieval practice / testing effect** (Roediger & Karpicke 2006) – učení přes testy a tréninkové úlohy.
- **Generation effect + errorful learning** (Slamecka & Graf 1978; Kornell et al. 2009) – „zkus to přepočítat" před ukázáním řešení.
- **Okamžitá zpětná vazba s vysvětlením** (Hattie & Timperley 2007).
- **Von Restorffův efekt izolace** – vizuálně odlišené (zvýrazněné) informace se pamatují lépe.
- **Signaling principle** (Mayer, multimediální učení) – zvýraznění klíčových slov a postupné odkrývání snižuje kognitivní zátěž.
- **Worked examples** (Sweller) – vysvětlení jako řešený příklad krok za krokem.
- **Elaborative interrogation** – chat „proč?" podporuje hlubší zpracování.
- **Spaced repetition / interleaving** (Cepeda 2006; Rohrer & Taylor 2007) – chyby se vrací v dalších dnech, trénink mixuje typy.
- Pozn.: zvýrazňování samo o sobě (když si ho dělá student pasivně) má nízkou účinnost (Dunlosky 2013) → proto zvýrazňuje *učitel* (AI) jen to podstatné a kombinuje se s aktivním přepočítáním.

## 8. Gamifikace

- **XP**: správná tréninková úloha 10 XP (+bonus za rychlost), dokončený test 100 XP + 2 XP/bod, opravená chyba 15 XP.
- **Level**: progresivní křivka, zobrazení v hlavičce.
- **Streak**: den se počítá, když uživatel splní aspoň 1 úlohu; plamínek, nejlepší streak.
- **Denní cíl**: minuty (10/20/30/60) – kruhový progres.
- **Achievementy**: první test, 5 testů, streak 3/7/30, 100/500 úloh, opravené chyby, perfektní oddíl, noční sova, ranní ptáče…
- **Heatmapa** jako GitHub.

## 9. Bezpečnost a soukromí

- Klíče odpovědí jen na serveru, vyhodnocení na serveru.
- Supabase RLS, service-role klíč jen v serverovém prostředí.
- AI endpointy jen pro přihlášené, rate limit.

## 10. To-do list

### Fáze 0 – příprava
- [x] Projít `testy/`, identifikovat duplicity (10 unikátních testů)
- [x] Zjistit pravidla OSP (časy, počty, bodování)
- [x] Sepsat tento plán

### Fáze 1 – obsah
- [x] Extrakce textu a obrázků z PDF
- [x] Převod 10 testů do JSON (LaTeX pro matematiku, tabulky, figury)
- [x] Vyřešit a zapsat klíč správných odpovědí pro všech 660 úloh
- [x] Validační skript obsahu (struktura, počty, figury, klíč)

### Fáze 2 – aplikace
- [x] Scaffold Next.js + Tailwind + Supabase
- [x] SQL migrace (tabulky, RLS, funkce)
- [x] Auth (registrace, přihlášení, odhlášení) + onboarding
- [x] Test runner (oddíly, odpočet, pauza, ukládání, varování při odchodu)
- [x] Vyhodnocení na serveru, výsledky, percentil, porovnání s minulým testem
- [x] Rozbor chyb + „zkus znovu“
- [x] Dashboard, slabiny, pokrok (heatmapa, grafy, historie)
- [x] Gamifikace (XP, level, streak, denní cíl, achievementy)

### Fáze 3 – AI
- [x] AI vysvětlení se zvýrazněním + cache
- [x] AI chat k úloze (streaming)
- [x] Generátor úloh + programová kontrola + AI validátor
- [x] Pool úloh s recyklací mezi uživateli
- [x] Rate limit

### Fáze 4 – dokončení
- [x] Responzivita (mobil / desktop), dark mode
- [x] Build + lint + test obsahu
- [x] README s návodem na nasazení (Supabase, Vercel, env)
- [x] Git repo + push na GitHub

### Fáze 5 – po nasazení (čeká na klíče)
- [ ] Ověřit AI naživo: `npm run pool -- --dry --type analogie --count 2` (kvalita generátoru + validátoru)
- [ ] Předgenerovat pool úloh (`npm run pool -- --type all --count 3`)
- [ ] Projít celý tok na produkci (registrace → úvodní test → výsledky → rozbor → trénink)

## Changelog
- 2026-10-22 – první verze plánu.
- 2026-10-22 – obsah: 10 testů převedeno paralelně (5 agentů). Zjištěno, že většina PDF označuje oficiální správnou
  odpověď tučně / rámečkem → klíče ověřeny proti značení (8 testů), 2 testy (2023-03-b, 2025-05-a) bez značení,
  řešeny samostatně. Přidáno `alsoAccepted` (dvě uznané odpovědi dle NOK) a `excluded` (úloha vyřazená z hodnocení).
- 2026-10-22 – aplikace postavena: Next.js 16 + Supabase + Claude API, build/lint/typecheck OK, SQL migrace ověřena
  na lokálním Postgresu, bodování ověřeno proti statistikám Scio.
