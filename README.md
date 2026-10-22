# Natrénuj testy

Soukromá aplikace (noindex, registrace jen s přístupovým kódem).

Webová aplikace pro přípravu na Národní srovnávací zkoušky (Scio) – zatím **OSP**.
Ostré testy z minulých let na čas, rozbor chyb s AI lektorem, nekonečný trénink AI úloh
ve stylu Scio, gamifikace (XP, levely, streak, denní cíl, achievementy).

Závazný plán a to-do list: [PLAN.md](PLAN.md).

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres + Auth) · Anthropic Claude API · Vercel

## Nasazení (vše na free tieru, platí se jen AI)

### 1. Supabase
1. Na [supabase.com](https://supabase.com) založ nový projekt (Free, region **Central EU (Frankfurt)**).
2. **SQL Editor → New query** → vlož celý obsah [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) → **Run**.
3. **Authentication → Sign In / Providers**: vypni **Allow new users to sign up**. Registrace jde jen přes aplikaci
   s přístupovým kódem (`SIGNUP_ACCESS_CODE`), účty zakládá server – nikdo cizí se nezaregistruje přímo přes Supabase.
4. **Authentication → URL Configuration**: *Site URL* = adresa z Vercelu (např. `https://scio-trenazer.vercel.app`),
   do *Redirect URLs* přidej `https://scio-trenazer.vercel.app/**` a `http://localhost:3000/**`.
5. **Project Settings → API Keys**: zkopíruj *Project URL*, *Publishable key* a *Secret key*.

> Free projekt se po 7 dnech bez aktivity uspí – v dashboardu ho jedním klikem probudíš.

### 2. Anthropic
[console.anthropic.com](https://console.anthropic.com) → API Keys → vytvoř klíč, v Billing nabij kredit (stačí pár dolarů).

### 3. Vercel
1. [vercel.com/new](https://vercel.com/new) → importuj tento GitHub repozitář (Framework: Next.js, nic neměň).
2. **Environment Variables** – podle [`.env.example`](.env.example):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY`
   a **`SIGNUP_ACCESS_CODE`** (přístupový kód pro registraci – rozdáváš ho jen ty; bez něj je registrace vypnutá).
3. **Deploy**. Pak doplň Vercel URL do Supabase (krok 1.4).

### 4. (Volitelně) předgenerovat tréninkové úlohy
Lokálně s vyplněným `.env.local`:
```bash
npm install
npm run pool -- --dry --type analogie --count 2   # test kvality: vygeneruje, zvaliduje, vypíše, neuloží
npm run pool -- --type all --count 3              # naplní sdílený pool (13 typů × až 3 úlohy)
```
Bez předgenerování se úlohy vytváří automaticky při tréninku (první načtení trvá ~1 min, další jsou připravené).

## Lokální vývoj
```bash
cp .env.example .env.local   # doplň hodnoty
npm install
npm run dev                  # http://localhost:3000
```
- `npm run validate:content` – kontrola všech testů v `content/osp/tests/`
- `npm run typecheck`, `npm run lint`, `npm run build`
- `http://localhost:3000/dev/<testId>` (jen v dev režimu) – náhled testu se všemi klíči a řešeními
- `npm run dev:demo` – celá aplikace bez Supabase (databáze v paměti, fiktivní uživatel) na http://localhost:3001 – na UI testování

## AI a náklady
- Výchozí model `claude-opus-5-5` (nejvyšší kvalita). Pro úsporu nastav `AI_MODEL=claude-haiku-5-5` (~40× levnější).
- Vysvětlení se cachují v DB (každá úloha se vysvětluje jen jednou pro všechny), AI úlohy se recyklují mezi uživateli.
- Každá AI úloha prochází 2 kontrolami: programovou (formát, možnosti, klíč) a nezávislým AI validátorem, který ji vyřeší
  bez znalosti klíče a hodnotí češtinu, existenci slov, jednoznačnost, styl a obtížnost Scio. Neprošlé se zahodí.
- Denní limity AI na uživatele: `AI_DAILY_*` proměnné.

## Obsah
`content/osp/tests/*.json` – 10 unikátních testů OSP (2023–2026), převedené z PDF, matematika v KaTeX,
grafy v `public/figures/`. Klíče ověřené vlastním řešením a u 8 testů i proti oficiálnímu značení v PDF.
Schéma: [`src/lib/content/types.ts`](src/lib/content/types.ts), návod převodu: [`content/CONVERSION_GUIDE.md`](content/CONVERSION_GUIDE.md).
Nový test = nový JSON + `npm run validate:content`. Další zkouška (ZSV, AJ…) = obsah + `enabled: true` v `src/lib/content/exams.ts`.
