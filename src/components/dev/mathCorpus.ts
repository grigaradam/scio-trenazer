import type { ExplanationData } from "../Explanation";
import type { PublicGroup } from "@/lib/content/public";
import type { ChartSpec } from "@/lib/content/types";

// Math formatting QA corpus: every construct the content, generator or AI explanations may produce.
// Rendered visually at /dev/math and checked automatically by scripts/check-math.ts.

export const MATH_SAMPLES: { title: string; items: string[] }[] = [
  {
    title: "Mocniny a indexy",
    items: [
      "$x^2$, $x^{10}$, $2^{-3}$, $a^{n+1}$, $10^{-6}$",
      "$x^{y^z}$, $2^{2^{2^2}}$, $e^{-x^2}$, $(a+b)^2 = a^2 + 2ab + b^2$",
      "$x_1$, $x_{12}$, $a_{n-1}$, $x_1^2 + x_2^2$, $a_{i,j}$",
      "$\\left(\\frac{2}{3}\\right)^2$, $\\left(-\\frac{1}{2}\\right)^{-3}$, $(-2)^3 = -8$, $-2^2 = -4$",
      "$x^{\\frac{1}{2}}$, $8^{\\frac{2}{3}} = 4$, $a^{\\frac{m}{n}} = \\sqrt[n]{a^m}$",
      "$a^m \\cdot a^n = a^{m+n}$, $\\frac{a^m}{a^n} = a^{m-n}$, $(a^m)^n = a^{mn}$, $a^0 = 1$",
      "$1{,}2 \\cdot 10^{5}$, $3{,}5 \\cdot 10^{-4}$, $10^{3} \\text{ m}$",
      "$x'$, $f'(x)$, $f''(x)$, $A'B'$",
    ],
  },
  {
    title: "Odmocniny",
    items: [
      "$\\sqrt{2}$, $\\sqrt{x}$, $\\sqrt{x^2 + y^2}$, $\\sqrt{16} = 4$",
      "$\\sqrt[3]{8} = 2$, $\\sqrt[4]{81}$, $\\sqrt[n]{a}$, $\\sqrt[n]{a^m}$",
      "$\\sqrt{\\sqrt{x}}$, $\\sqrt{2 + \\sqrt{3}}$, $\\sqrt{2 + \\sqrt{2 + \\sqrt{2}}}$",
      "$\\sqrt{\\frac{a}{b}} = \\frac{\\sqrt{a}}{\\sqrt{b}}$, $\\frac{1}{\\sqrt{2}} = \\frac{\\sqrt{2}}{2}$",
      "$2\\sqrt{3}$, $3\\sqrt{2} \\cdot \\sqrt{8} = 12$, $\\sqrt{12} = 2\\sqrt{3}$",
      "$\\sqrt{x}^2$, $(\\sqrt{x})^2 = x$, $\\sqrt{x^{2}} = |x|$",
    ],
  },
  {
    title: "Zlomky",
    items: [
      "$\\frac{1}{2}$, $\\frac{56}{x}$, $\\frac{a+b}{c-d}$, $\\frac{-3}{4}$, $-\\frac{3}{4}$",
      "Inline ve větě: polovina je $\\frac{1}{2}$ a třetina $\\frac{1}{3}$, dohromady $\\frac{5}{6}$ celku.",
      "Zlomek ve zlomku: $\\frac{\\frac{1}{2}}{\\frac{3}{4}} = \\frac{2}{3}$",
      "Zlomek ve zlomku (dfrac): $\\dfrac{\\dfrac{1}{2}}{\\dfrac{3}{4}} = \\dfrac{2}{3}$",
      "Smíšené: $\\frac{1 + \\frac{1}{x}}{1 - \\frac{1}{x}}$, $\\frac{\\frac{a}{b} + \\frac{c}{d}}{\\frac{e}{f}}$",
      "Řetězový zlomek: $1 + \\cfrac{1}{1 + \\cfrac{1}{1 + \\cfrac{1}{2}}}$",
      "Smíšené číslo: $2\\frac{1}{3}$, $3\\tfrac{3}{4}$, $1\\,\\frac{1}{2}$",
      "Lomítko: $3/4$, $x/y$, $(a+b)/2$, $1/2 + 1/3$",
      "$\\frac{x^2 - 1}{x + 1} = x - 1$, $\\frac{2^{10}}{2^{8}} = 4$, $\\frac{\\sqrt{3}}{2}$",
      "$\\frac{1}{2} + \\frac{1}{3} = \\frac{3}{6} + \\frac{2}{6} = \\frac{5}{6}$",
      "$\\tfrac{1}{2}$ vs $\\frac{1}{2}$ vs $\\dfrac{1}{2}$",
    ],
  },
  {
    title: "Operace a znaménka",
    items: [
      "$a + b - c$, $a \\cdot b$, $a \\times b$, $a : b$, $a \\div b$, $a \\pm b$, $a \\mp b$",
      "$3 \\cdot (-2) = -6$, $-(-5) = 5$, $-x - (-y)$, $5 - 3 = 2$",
      "$2 \\cdot 3 \\cdot 4 = 24$, $6 : 2 \\cdot 3 = 9$, $(2 + 3) \\cdot 4$, $[2 + (3 - 1)] \\cdot 2$, $\\{1 + [2 \\cdot (3 + 4)]\\}$",
      "$n!$, $5! = 120$, $0! = 1$, $\\binom{5}{2} = 10$, $\\binom{n}{k} = \\frac{n!}{k!(n-k)!}$",
      "$|x|$, $|-3| = 3$, $\\left|\\frac{x}{2}\\right|$, $\\lvert a - b \\rvert$, $\\|v\\|$",
      "$\\lfloor x \\rfloor$, $\\lceil x \\rceil$, $\\gcd(12, 18) = 6$, $\\operatorname{nsn}(4, 6) = 12$, $\\text{NSD}(12, 18) = 6$",
      "$a \\equiv b \\pmod{n}$, $17 \\bmod 5 = 2$, $3 \\mid 12$, $3 \\nmid 13$",
    ],
  },
  {
    title: "Relace",
    items: [
      "$a = b$, $a \\neq b$, $a \\ne b$, $a < b$, $a > b$, $a \\leq b$, $a \\geq b$, $a \\le b$, $a \\ge b$",
      "$a \\leqslant b$, $a \\geqslant b$, $a \\ll b$, $a \\gg b$",
      "$\\pi \\approx 3{,}14$, $\\pi \\doteq 3{,}14$, $x \\sim y$, $a \\simeq b$, $a \\cong b$, $a \\equiv b$, $y \\propto x$",
      "$1 < x \\leq 5$, $-2 \\le x < 3$, $0 < a < b$",
      "$\\Rightarrow$, $\\Leftarrow$, $\\Leftrightarrow$, $\\iff$, $\\implies$, $\\to$, $\\mapsto$, $\\rightarrow$, $\\leftarrow$",
    ],
  },
  {
    title: "Množiny, intervaly, logika",
    items: [
      "$\\mathbb{N}$, $\\mathbb{Z}$, $\\mathbb{Q}$, $\\mathbb{R}$, $\\mathbb{C}$, $\\mathbb{R}^+$, $\\mathbb{N}_0$",
      "$x \\in A$, $x \\notin B$, $A \\subset B$, $A \\subseteq B$, $A \\supset B$, $A \\not\\subset B$",
      "$A \\cup B$, $A \\cap B$, $A \\setminus B$, $A'$, $\\overline{A}$, $A^c$, $\\emptyset$, $\\varnothing$, $|A| = 3$",
      "$\\{1, 2, 3\\}$, $\\{x \\in \\mathbb{R} : x > 0\\}$, $\\{x \\mid x^2 < 4\\}$",
      "Intervaly: $\\langle 1; 5 \\rangle$, $(1; 5)$, $\\langle 0; \\infty)$, $(-\\infty; 3\\rangle$, $[1, 5]$, $(-\\infty, \\infty)$",
      "$\\left\\langle -\\frac{1}{2}; \\frac{3}{2} \\right\\rangle$, $x \\in (-\\infty; -1) \\cup \\langle 2; \\infty)$",
      "$\\forall x$, $\\exists y$, $\\nexists z$, $\\neg p$, $p \\land q$, $p \\lor q$, $p \\Rightarrow q$, $p \\veebar q$",
    ],
  },
  {
    title: "Procenta, jednotky, čísla",
    items: [
      "$50\\,\\%$, $12{,}5\\,\\%$, $\\frac{1}{4} = 25\\,\\%$, $x\\%$, $100 \\%$",
      "Procento mimo math: 25 % ze 200 = $50$; sleva 20 % → $0{,}8 \\cdot x$",
      "$4{,}5$, $0{,}25$, $-3{,}75$, $3{,}14159$, $0{,}\\overline{3}$, $0{,}1\\overline{6}$, $1{,}\\overline{142857}$",
      "$1\\,000$, $1\\,000\\,000$, $12\\,345{,}67$, $10\\ 000$, $2\\,500\\text{ Kč}$",
      "cm$^2$, m$^3$, $42{,}5\\ \\text{cm}^3$, $5\\ \\text{m}^2$, $\\text{km}/\\text{h}$, $\\frac{\\text{m}}{\\text{s}}$, $9{,}81\\ \\text{m}/\\text{s}^2$, $\\text{m}\\cdot\\text{s}^{-1}$",
      "$90^\\circ$, $45°$, $360^{\\circ}$, $-5\\,^\\circ\\text{C}$, $\\alpha = 30^\\circ$",
      "$3 : 4$, $1 : 50\\,000$, $a : b = 2 : 3$",
      "$\\$5$ (dolar v math), 100 Kč, cena $x$ Kč",
    ],
  },
  {
    title: "Geometrie",
    items: [
      "$\\triangle ABC$, $\\angle ABC = 60^\\circ$, $\\measuredangle \\alpha$, $|AB| = 5\\text{ cm}$, $\\overline{AB}$, $\\overrightarrow{AB}$, $\\vec{u}$, $\\vec{v} = (1; 2)$",
      "$AB \\parallel CD$, $AB \\perp CD$, $\\triangle ABC \\sim \\triangle DEF$, $\\triangle ABC \\cong \\triangle DEF$, $\\overset{\\frown}{AB}$",
      "$S = \\pi r^2$, $o = 2\\pi r$, $V = \\frac{4}{3}\\pi r^3$, $S = \\frac{a \\cdot v_a}{2}$, $c^2 = a^2 + b^2$",
      "$\\sin\\alpha$, $\\cos 60^\\circ = \\frac{1}{2}$, $\\operatorname{tg} \\alpha$, $\\tan x$, $\\cot x$, $\\sin^2 x + \\cos^2 x = 1$",
      "$\\alpha, \\beta, \\gamma, \\delta, \\varepsilon, \\epsilon, \\varphi, \\phi, \\omega, \\lambda, \\mu, \\sigma, \\theta, \\Delta, \\Omega, \\Sigma, \\Pi$",
      "$P(A) = \\frac{3}{8}$, $P(A \\cap B) = P(A) \\cdot P(B)$, $\\bar{x} = \\frac{x_1 + \\dots + x_n}{n}$, $\\ldots$, $\\cdots$",
    ],
  },
  {
    title: "Funkce, rovnice, analýza",
    items: [
      "$f(x) = 2x + 3$, $f: y = x^2$, $f^{-1}(x)$, $g \\circ f$, $D(f) = \\mathbb{R}$, $H(f) = \\langle 0; \\infty)$",
      "$\\log x$, $\\log_2 8 = 3$, $\\log_{10} 100$, $\\ln e = 1$, $\\exp(x)$",
      "$x_{1,2} = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$",
      "$\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1$, $\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$, $\\prod_{k=1}^{n} k$, $\\int_0^1 x^2\\,dx$",
      "$\\max\\{a, b\\}$, $\\min(x, y)$, $\\infty$, $-\\infty$, $\\partial$, $\\nabla$",
      "$\\begin{cases} x + y = 5 \\\\ x - y = 1 \\end{cases}$",
      "$|x| = \\begin{cases} x & x \\ge 0 \\\\ -x & x < 0 \\end{cases}$",
      "$\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}$, $\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix} = ad - bc$",
    ],
  },
  {
    title: "Text a formátování uvnitř math",
    items: [
      "$\\text{obsah} = \\frac{\\text{základna} \\cdot \\text{výška}}{2}$",
      "$\\text{rychlost} = \\frac{\\text{dráha}}{\\text{čas}}$, $v = \\frac{s}{t}$",
      "$\\mathrm{d}x$, $\\mathbf{v}$, $\\boldsymbol{\\alpha}$, $\\mathit{abc}$, $\\textbf{tučně}$",
      "$\\underbrace{1 + 2 + \\dots + n}_{n}$, $\\overbrace{a + b}^{2}$, $\\underline{x}$, $\\cancel{x}$",
      "$\\color{red}{x} + y$, $\\boxed{x = 2}$, $\\phantom{x}$",
      "$x \\quad y \\qquad z$, $a\\,b\\;c\\!d$",
    ],
  },
  {
    title: "Display (blokové) vzorce",
    items: [
      "Text před vzorcem\n\n$$\n\\frac{\\frac{1}{2} + \\frac{1}{3}}{\\frac{5}{6}} = 1\n$$\n\nText za vzorcem.",
      "$$x_{1,2} = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$",
      "$$\n\\begin{aligned}\n2x + 3 &= 11 \\\\\n2x &= 8 \\\\\nx &= 4\n\\end{aligned}\n$$",
      "$$\n\\sqrt[3]{\\frac{27 \\cdot 10^{6}}{8 \\cdot 10^{-3}}} = \\frac{3 \\cdot 10^{2}}{2 \\cdot 10^{-1}} = 1\\,500\n$$",
      "Display uprostřed věty $$\\frac{a}{b}$$ a pokračování.",
      "$$\n1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10 + 11 + 12 + 13 + 14 + 15 + 16 + 17 + 18 + 19 + 20 + 21 + 22 + 23 + 24 + 25 = 325\n$$",
    ],
  },
  {
    title: "Interakce s Markdownem",
    items: [
      "**Tučně $x^2$ tučně**, *kurzíva $\\frac{1}{2}$*, ==zvýrazněno $x = 2$ zvýrazněno==",
      "==$x^2 + y^2 = r^2$==",
      "==Výsledek je $\\frac{5}{6}$==, a dál ==$x$ a $y$==.",
      "<u>podtrženo $x^2$</u>, <u>$\\sqrt{2}$</u>",
      "$a*b*c$, $x_1 + x_2 + y_1$, $a_b c_d$, $\\_$, $a \\ast b$",
      "Násobení hvězdičkou: $2 * 3 = 6$ a $4 * 5 = 20$",
      "- položka $x^2$\n- položka $\\frac{1}{2}$\n- položka $\\sqrt{2}$",
      "1. Krok: $2x = 8$\n2. Krok: $x = 4$",
      "| x | $x^2$ | $\\sqrt{x}$ |\n|---|---|---|\n| $4$ | $16$ | $2$ |\n| $\\frac{1}{4}$ | $\\frac{1}{16}$ | $\\frac{1}{2}$ |",
      "| výraz | hodnota |\n|---|---|\n| $\\lvert -3 \\rvert$ | $3$ |\n| $\\vert x \\vert$ | $x$ |",
      "| výraz | hodnota |\n|---|---|\n| $|-3|$ | $3$ |",
      "$x$-krát, $n$-tý člen, $2x$násobek, ($x + 1$), [$a$], „$x$“, $x$.",
      "Dva vzorce těsně: $a$$b$, $a$ $b$, $a$,$b$",
      "`kód $x$` a $x$",
      "Zpětná lomítka AI: \\(x^2 + 1\\) a blok \\[\\frac{a}{b}\\]",
      "Mezera uvnitř: $ x + 1 $, $x + 1 $, $ x$",
      "Cena 5 $ a 10 $ (dolar mimo math)",
      "Escapovaný dolar \\$5 a $x$",
    ],
  },
  {
    title: "Co může napsat AI (opravuje se automaticky)",
    items: [
      "Neescapované procento: $20%$ z $150$ je $30$, sleva $15 %$ a $x = 5$",
      "Unicode ve vzorci: $2 × 3 · 4 − 1 ≤ 5$, $a ≥ b ≠ c$, $8 ÷ 2 ± 1$, $x² + y³$, $45°$, $√2$, $√{x+1}$, $½ + ¼ = ¾$",
      "Česká slova bez textového příkazu: $v = \\frac{dráha}{čas}$, $obsah = a \\cdot b$, $cena = 5 \\cdot počet$",
      "Chybějící příkazy: $\\tg x$, $\\cotg x$, $\\cotan x$, $\\sgn x$, $\\Q$, $\\C$, $\\abs{x - 2}$, $\\lcm(4, 6)$, $\\sfrac{1}{2}$, $\\arc{AB}$, $\\vv{AB}$, $\\mbox{cm}$, $\\SI{5}{m}$, $20\\celsius$",
      "Zarovnání inline: $\\begin{align} x &= 2 \\\\ y &= 3 \\end{align}$",
      "$$x_{1,2} = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$",
      "Odrážka se vzorcem:\n\n- první krok\n  $$\\frac{a}{b} = \\frac{c}{d}$$\n- druhý krok",
      "$$\n\\begin{align}\n2x &= 8 \\\\\nx &= 4\n\\end{align}\n$$",
      "Absolutní hodnoty: $|-3| + |x - 1| = |-2|$, $||x| - 1|$, $\\left| -\\frac{1}{2} \\right|$, $3 | 12$",
      "Seznam bez operátorů: $\\alpha, \\beta, \\gamma, \\delta, \\varepsilon, \\varphi, \\omega, \\lambda, \\mu, \\sigma, \\theta, \\Delta, \\Omega, \\Sigma$",
      "Dlouhý inline výraz: $1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10 + 11 + 12 + 13 + 14 + 15 + 16 + 17 + 18 + 19 + 20 = 210$",
      "`kód $|x|$ zůstává` a $|x|$",
    ],
  },
];

export const ALL_SAMPLES = MATH_SAMPLES.flatMap((s) => s.items);

// Every text field of the components that render content, filled with math.
export const SAMPLE_EXPLANATION: ExplanationData = {
  verdict: "Správně je ==(A)==: každé z tvrzení samo stačí, protože $3 \\mid x$.",
  steps: [
    { title: "Tvrzení (1): $6 \\mid 5x$", body: "Když $6 \\mid 5x$, pak i $3 \\mid 5x$. Platí tedy $3 \\mid x$." },
    { title: "Tvrzení (2): $18 \\mid 12x$", body: "Zapíšeme $12x = 18k$, tedy $2x = 3k$, takže ==$3 \\mid x$==." },
    { title: "Zlomek v nadpisu: $\\frac{\\frac{1}{2}}{\\frac{3}{4}} = \\frac{2}{3}$, $\\sqrt[3]{8}$, $x^{2}$", body: "$$\\frac{a}{b}$$" },
  ],
  options: [
    { key: "A", correct: true, why: "$x = 3k$ splňuje obě tvrzení." },
    { key: "B", correct: false, why: "Vychází $\\frac{1}{2}$, ne $\\frac{2}{3}$." },
  ],
  trap: "Zapomenout, že $\\gcd(5, 3) = 1$.",
  tip: "Dělitelnost: $a \\mid bc$ a $\\gcd(a, b) = 1 \\Rightarrow a \\mid c$.",
};
export const SAMPLE_CHART: ChartSpec = {
  kind: "bar",
  title: "Obsah $S$ v cm$^2$ pro $r = \\frac{1}{2}$ až $2$",
  xLabel: "poloměr $r$ [cm]",
  yLabel: "obsah $S = \\pi r^2$",
  unit: "cm$^2$",
  categories: ["$r = \\frac{1}{2}$", "$r = 1$", "$r = \\sqrt{2}$", "$r = 2$"],
  series: [
    { name: "$S$ přesně", values: [1, 3, 6, 13] },
    { name: "$S \\approx 3{,}14 \\cdot r^2$", values: [1, 3, 6, 12] },
  ],
};
export const SAMPLE_GROUP = {
  id: "dev",
  taskType: "data",
  instruction: "Instrukce s $\\frac{1}{2}$ a $x^2$.",
  passageTitle: "Text k úlohám: $\\frac{a}{b}$ a $\\sqrt{2}$",
  passage: "Výchozí text: $V = \\frac{4}{3}\\pi r^3$.",
  questions: [],
} as unknown as PublicGroup;
