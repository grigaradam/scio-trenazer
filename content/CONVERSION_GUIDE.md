# Převod testu OSP z PDF do JSON – návod

Cíl: z PDF testu udělat `content/osp/tests/<id>.json` přesně podle `src/lib/content/types.ts`
(TestFile), **s vyřešeným klíčem správných odpovědí** a krátkým zdůvodněním u každé úlohy.
PDF klíč neobsahují – každou úlohu musíš vyřešit sám a pečlivě.

## Nástroje

Python s PyMuPDF: `PY=/private/tmp/claude-501/-Users-adam-claude-projects-scio/ae79479d-302b-43c5-9927-457c1a600807/scratchpad/venv/bin/python`
(vždy spouštěj s `-I`). Pracovní soubory dávej do vlastní složky ve scratchpadu
(`/private/tmp/claude-501/-Users-adam-claude-projects-scio/ae79479d-302b-43c5-9927-457c1a600807/scratchpad/<tvoje-id>/`).

- Text: `$PY -I -c "import fitz;d=fitz.open('PDF');print('\n'.join(f'=== PAGE {i+1}\n'+p.get_text() for i,p in enumerate(d)))"`
- Náhled stránek (PNG, pak si je prohlédni nástrojem Read): `$PY -I scripts/pdf/render.py <pdf> <out_prefix> 12-18 110`
- Souřadnice bloků/obrázků/kreseb na stránce: `$PY -I scripts/pdf/blocks.py <pdf> <page>`
- Výřez obrázku: `$PY -I scripts/pdf/crop.py <pdf> <page> x0 y0 x1 y1 public/figures/<id>/<name>.png 200`
- Kontrola výsledku: `node scripts/validate-content.mjs content/osp/tests/<id>.json` (musí projít bez chyb)

Extrahovaný text je u matematiky (zlomky, mocniny, odmocniny, vzorce) **rozbitý** – u analytického
oddílu si VŽDY prohlédni vyrenderované stránky a matematiku přepiš podle obrázku.
Stejně tak u verbálního oddílu zkontroluj vizuálně podtržená slova (synonyma) a kurzívu.

## Pravidla převodu

- Struktura: 2 sekce – `verbal` (title "Verbální oddíl", timeLimitSec 2100) a `analytic`
  (title "Analytický oddíl", timeLimitSec 3000). 66 úloh, čísla 1–66 přesně jako v testu.
- Skupiny (`groups`): jedna skupina = blok úloh pod jednou instrukcí, resp. jeden sdílený text.
  Id `g01`, `g02`… Instrukci zkopíruj doslova (bez zbytečných zalomení řádků).
  Pokud je pod jednou instrukcí víc sdílených textů (např. TEXT K ÚLOHÁM 24–26 a 27–29),
  udělej pro každý text vlastní skupinu se stejnou instrukcí.
- `taskType` podle tabulky v `PLAN.md` (doplnovani, analogie, synonyma, nesoulad, vyplyvani,
  porozumeni, dva_texty, data, porovnani, dostatecnost, slovni, vyrazy, podminky).
  Řiď se instrukcí bloku, ne číslem úlohy.
  - `vyrazy` = úlohy „založené na textu nebo matematickém výrazu" (operace #, funkce f, vztahy mezi proměnnými),
  - `data` = grafy/tabulky se společnými daty,
  - `podminky` = soubory podmínek („Víme, že: …") se společným textem.
- Text: spoj zalomené řádky do souvislých odstavců, oprav slova rozdělená extrakcí
  („řada unikátních výrobků" ne po slovech na řádcích). Zachovej diakritiku, uvozovky „…", pomlčky –.
  Odrážky podmínek (znak  apod.) převeď na markdown seznam `- `.
  Výroky 1) 2) 3) dej do stemu jako řádky `1) …` oddělené `\n\n`.
- Rich text: `**tučně**`, `*kurzíva*`, `<u>podtržení</u>` (synonyma: podtržený výraz ve větě!),
  matematika KaTeX `$\frac{56}{x}$`, `$x^2$`, `$\sqrt{2}$`, `$\cdot$`, desetinná čárka `$4{,}5$`,
  jednotky `cm$^2$`/`$42{,}5\ \text{cm}^3$`. Prázdné místo ve větě = `______` (6 podtržítek).
  Tabulky převeď na GFM markdown tabulky (když jdou rozumně přepsat), jinak výřez obrázku.
  Tabulka se sloučenými buňkami v záhlaví (např. „prodáno" nad sloupci leden–duben) se NESMÍ
  zplošťovat do „prodáno – leden": zapiš ji jako HTML `<table>` s `<thead>` (`<th rowspan>`/`<th colspan>`
  přesně jako v PDF) a `<tbody>` (popisek řádku `<th scope="row">`, hodnoty `<td>`), bez prázdných řádků
  uvnitř. Hodnoty buněk opiš beze změny.
  V JSON správně escapuj zpětná lomítka (`"$\\frac{1}{2}$"`).
- Možnosti: přesný text bez „(A)". Synonyma: `parts` = 2 části:
  `{label:"synonymum", options A–D}` a `{label:"antonymum", options E–H}`, každá s vlastním `answer`.
  Ostatní úlohy mají `parts` s jednou částí (A–D).
- Porovnávání (`porovnani`): `stem` = společná informace nad výrazy (nebo "" když žádná není),
  `compare: {left, right}` = výrazy vlevo/vpravo; options = standardní 4 věty
  („Hodnota vlevo je větší než hodnota vpravo." atd. přesně jak v testu).
- Obrázky (grafy, geometrie, schémata, tabulky co nejdou přepsat): ořízni z PDF do
  `public/figures/<id>/` (název `q42.png` nebo `g12.png` pro skupinu), dpi 200, s malým okrajem,
  bez čísla úlohy a bez textu, který už je ve stemu. Cesta v JSON `/figures/<id>/q42.png`.
- `stats` z první stránky (participants, mean = Průměrné skóre, median, sd = Směr. odchylka,
  maxScore = Max. možné skóre, minScore = Min. možné skóre). Čísla jako JSON number (tečka).
- `source` = název PDF souboru, `title` např. "OSP – Prosinec 2025, varianta A", `date` "2025-12".
- Zdroje textů (poslední strana) a copyright stránky nepřevádět.

## Klíč a řešení (nejdůležitější část)

- Každou úlohu vyřeš poctivě. Matematiku a podmínkové úlohy si ověř výpočtem / systematickým
  výčtem (klidně krátký Python skript s `-I`). U podmínkových úloh projdi všechny přípustné varianty.
- Verbální úlohy: čti přesně instrukci (nejlépe hodí, nejpodobnější vztah, vyplývá *pouze* z textu,
  nesoulad s celkovým vyzněním…). Pořadí ve dvojicích analogií je důležité.
- `solution`: 1–4 věty česky, proč je správná odpověď správná (a případně proč ne lákavá chybná).
  U matematiky stručný výpočet (s KaTeX).
- Pokud si u úlohy nejsi jistý, vyřeš ji znovu jiným postupem. Úlohy, kde jistota zůstane nízká,
  vypiš v závěrečném reportu (číslo + důvod).

## Závěrečná kontrola

1. `node scripts/validate-content.mjs content/osp/tests/<id>.json` → 0 chyb.
2. Projdi si JSON očima: české věty dávají smysl, nic není useknuté, matematika sedí s PDF.
3. Rozložení odpovědí A/B/C/D by mělo být zhruba rovnoměrné – výrazná nerovnováha = podezření na chybu.
