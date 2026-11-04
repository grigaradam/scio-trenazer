# Nanečisto

Soukromá aplikace (noindex, registrace jen s přístupovým kódem).

Webová aplikace pro přípravu na Národní srovnávací zkoušky (Scio) – **OSP** a **Anglický jazyk (AJ)**.
Ostré testy z minulých let na čas, rozbor chyb s AI lektorem, nekonečný trénink AI úloh
ve stylu Scio, gamifikace (XP, levely, streak, denní cíl, achievementy).

Závazný plán a to-do list: [PLAN.md](PLAN.md).

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres + Auth) · Anthropic Claude API · Vercel

## Nasazení (vše na free tieru, platí se jen AI)

### 1. Supabase
1. Na [supabase.com](https://supabase.com) založ nový projekt (Free, region **Central EU (Frankfurt)**).
2. **SQL Editor → New query** → vlož celý obsah [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) → **Run**,
   pak totéž s [`supabase/migrations/0002_admin.sql`](supabase/migrations/0002_admin.sql) (kódy, blokace, náklady AI, návštěvnost).
3. **Authentication → Sign In / Providers**: vypni **Allow new users to sign up**. Registrace jde jen přes aplikaci
   s jednorázovým kódem z `/dashboard`, účty zakládá server – nikdo cizí se nezaregistruje přímo přes Supabase.
4. **Authentication → URL Configuration**: *Site URL* = `https://nanecisto.fun`,
   do *Redirect URLs* přidej `https://nanecisto.fun/**` a `http://localhost:3000/**`.
5. **Project Settings → API Keys**: zkopíruj *Project URL*, *Publishable key* a *Secret key*.

> Free projekt se po 7 dnech bez aktivity uspí – v dashboardu ho jedním klikem probudíš.

### 2. Anthropic
[console.anthropic.com](https://console.anthropic.com) → API Keys → vytvoř klíč, v Billing nabij kredit (stačí pár dolarů).

### 3. Vercel
1. [vercel.com/new](https://vercel.com/new) → importuj tento GitHub repozitář (Framework: Next.js, nic neměň).
2. **Environment Variables** – podle [`.env.example`](.env.example):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY`
   a **`ADMIN_USERNAME`** + **`ADMIN_PASSWORD`** (přihlášení do `/dashboard`: jednorázové kódy a pozvánky, uživatelé,
   blokace, náklady AI, recyklace otázek, návštěvnost).
3. **Deploy**. Pak doplň Vercel URL do Supabase (krok 1.4).

### 4. (Volitelně) předgenerovat tréninkové úlohy
Lokálně s vyplněným `.env.local`:
```bash
npm install
npm run pool -- --dry --type analogie --count 2   # test kvality: vygeneruje, zvaliduje, vypíše, neuloží
npm run pool -- --type all --count 3              # naplní sdílený pool (18 typů × až 3 úlohy; --type aj = jen angličtina)
```
Bez předgenerování se úlohy vytváří automaticky při tréninku (první načtení trvá ~1 min, další jsou připravené).

## Lokální vývoj
```bash
cp .env.example .env.local   # doplň hodnoty
npm install
npm run dev                  # http://localhost:3000
```
- `npm run validate:content` – kontrola všech testů v `content/osp/tests/` a `content/aj/tests/`
- `npm run check:generator` – samokontrola generátoru: skutečné úlohy projdou kontrolami, prompt neroste s poolem, pojistka driftu
- `npm run drift -- --type aj_grammar --rounds 5 --batch 5` – živý test kvality AI úloh po kolech (dry run, potřebuje platný `ANTHROPIC_API_KEY`)
- `npm run sim:batch` – simulace celého generování (Batch API i synchronní cesta, lehké úlohy, rodiny variant, rozestupy)
  proti falešnému API a databázi v paměti – nic nestojí
- `npm run ab -- --types slovni --n 6 --b model=claude-sonnet-5-5` – A/B test nastavení generátoru se slepým hodnocením (stojí peníze, nejdřív vypíše odhad)
- `npm run typecheck`, `npm run lint`, `npm run build`
- `http://localhost:3000/dev/<testId>` (jen v dev režimu) – náhled testu se všemi klíči a řešeními
- `npm run dev:demo` – celá aplikace bez Supabase (databáze v paměti, fiktivní uživatel) na http://localhost:3001 – na UI testování

## AI a náklady
- Generátor `claude-opus-5-5` (nejvyšší kvalita), validátor `claude-sonnet-5-5` (nezávislý druhý model).
- Každá AI úloha prochází 2 kontrolami: programovou (formát, možnosti, klíč, délky jako u originálů) a nezávislým AI
  validátorem, který ji vyřeší bez znalosti klíče a hodnotí češtinu, existenci slov, jednoznačnost, styl a obtížnost Scio.
- **Batch API** (migrace [`0015_cheaper_tasks.sql`](supabase/migrations/0015_cheaper_tasks.sql), v `/dashboard` přepínač
  „Batch API (−50 %)“): generování na pozadí jde přes Message Batches API – stejné modely, prompty i kontroly za poloviční
  cenu, úlohy přibývají se zpožděním (obvykle do hodiny). Přes dávky se doplňuje i zásoba uživatele, dokud má aspoň jednu
  úlohu připravenou; když nemá žádnou, generuje se hned za plnou cenu.
- **Cache promptů**: pravidla typu a pevná sada skutečných úloh Scio (3 sady na typ, střídají se po hodině) jsou stálý
  začátek promptu v hodinové cache – čte se za 5 % ceny. Totéž u validátoru.
- **Méně zahozených pokusů**: generátor dostane délky originálů v číslech, špatně označené možnosti opraví kód,
  u synonym a word formation vybírá z nabídky dosud nepoužitých slov (navrhne je levný model, kód vyřadí použitá).
- **Lehké úlohy**: správná a jednoznačná úloha, jen lehčí než Scio, se nezahodí – ale lehkých je max. 10 % zásoby typu
  a uživatel dostane nejvýš jednu na 10 úloh daného typu (všichni, bez ohledu na předplatné).
- **Rodiny variant** (porovnávání, dostatečnost, slovní úlohy, výrazy, grafy, podmínky): z kvalitní ověřené úlohy udělá
  levný model variantu se stejným principem a jinými čísly a kontextem; validátor ji kontroluje jako každou jinou.
  Max. 3 úlohy v rodině, varianty max. 25 % zásoby, a uživatel dostane dalšího člena rodiny až po 15 jiných úlohách
  typu a 7 dnech.
- Vysvětlení se cachují v DB (každá úloha se vysvětluje jen jednou pro všechny). AI úlohy si nesou rozbor chytáků od
  generátoru, proto je vysvětluje levnější `AI_EXPLAIN_GEN_MODEL` (výchozí Sonnet); originální úlohy Scio dál Opus.
- Cena jedné úlohy po typech (vč. zahozených pokusů, podílu thinking, cache a Batch API) je v `/dashboard`. Přesná čísla
  počítá databáze (migrace [`0016_admin_report.sql`](supabase/migrations/0016_admin_report.sql)) – Supabase API vrací
  nejvýš 1000 řádků na dotaz, takže bez ní jsou součty při větším provozu neúplné. „Report pro Clauda“ v dashboardu
  obsahuje vše k optimalizaci: cenu a úspěšnost po typech, volání podle fáze a modelu (vč. cache), důvody zamítnutí,
  tempo po hodinách, dávky, zásobu a poptávku, kvalitu nových úloh, vysvětlení a chat.
- Levnější model nebo nižší effort pro konkrétní typ (`AI_MODEL_BY_TYPE`, `AI_FIRST_EFFORT`) nejdřív ověř:
  `npm run ab -- --types slovni --n 6 --b model=claude-sonnet-5-5` – porovná přijetí, skóre a cenu a připraví slepé hodnocení.
- Denní limity AI na uživatele: `AI_DAILY_*` proměnné.

## Obsah
`content/osp/tests/*.json` – 20 testů OSP (2023–2026): 10 převedených z PDF (klíče ověřené i proti značení v PDF)
a 10 přepsaných z fotek sešitů (klíče vlastním řešením, shodné úlohy mezi variantami mají shodný klíč).
`content/aj/tests/*.json` – 4 testy AJ (Reading + Use of English, bez poslechu). Matematika v KaTeX, grafy v `public/figures/`.
Schéma: [`src/lib/content/types.ts`](src/lib/content/types.ts), návod převodu: [`content/CONVERSION_GUIDE.md`](content/CONVERSION_GUIDE.md).
Nový test = nový JSON + `npm run validate:content`. Další zkouška (ZSV, AJ…) = obsah + `enabled: true` v `src/lib/content/exams.ts`.
