import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { PluggableList } from "unified";

const schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "u", "mark"],
  attributes: {
    ...defaultSchema.attributes,
    code: ["className"],
    span: ["className"],
    div: ["className"],
  },
};

/** Commands KaTeX lacks that content or AI output (Czech notation, LaTeX packages) may use. */
const macros = {
  "\\cotan": "\\operatorname{cotg}",
  "\\arccotg": "\\operatorname{arccotg}",
  "\\sgn": "\\operatorname{sgn}",
  "\\lcm": "\\operatorname{lcm}",
  "\\nsd": "\\operatorname{NSD}",
  "\\nsn": "\\operatorname{nsn}",
  "\\Q": "\\mathbb{Q}",
  "\\C": "\\mathbb{C}",
  "\\abs": "\\left\\lvert #1 \\right\\rvert",
  "\\norm": "\\left\\lVert #1 \\right\\rVert",
  "\\sfrac": "{}^{#1}\\!/\\!{}_{#2}",
  "\\nicefrac": "{}^{#1}\\!/\\!{}_{#2}",
  "\\napprox": "\\not\\approx",
  "\\arc": "\\overset{\\frown}{#1}",
  "\\overarc": "\\overset{\\frown}{#1}",
  "\\vv": "\\overrightarrow{#1}",
  "\\mbox": "\\text{#1}",
  "\\textdegree": "^{\\circ}",
  "\\celsius": "\\,^{\\circ}\\mathrm{C}",
  "\\ang": "#1^{\\circ}",
  "\\permil": "\\text{‰}",
  "\\euro": "\\text{€}",
  "\\unit": "\\,\\mathrm{#1}",
  "\\si": "\\mathrm{#1}",
  "\\SI": "#1\\,\\mathrm{#2}",
  "\\label": "",
};

type HastNode = { type: string; tagName?: string; properties?: Record<string, unknown>; children?: HastNode[] };

/** Numbers the <mark>s so each highlight sweeps in after the previous one (render-pure, unlike a counter in a component). */
const rehypeMarkOrder = () => (tree: HastNode) => {
  let i = 0;
  const walk = (n: HastNode) => {
    if (n.tagName === "mark") n.properties = { ...n.properties, style: `--mark-i: ${i++}` };
    n.children?.forEach(walk);
  };
  walk(tree);
};

const hasClass = (n: HastNode | undefined, c: string) => !!(n?.properties?.className as string[] | undefined)?.includes(c);
type TextNode = HastNode & { value: string };

/**
 * Keeps inline math together with punctuation glued to it ("$\frac12$,", "($x$)", "„$x$“"):
 * browsers may break between a formula box and the next character, leaving a comma at the start of
 * a line. The punctuation is moved into the formula's first/last unbreakable box (.base), so the
 * formula itself can still wrap at its operators.
 */
const rehypeGlueMath = () => (tree: HastNode) => {
  const glue = (value: string): HastNode => ({ type: "element", tagName: "span", properties: { className: ["math-glue"] }, children: [{ type: "text", value } as HastNode] });
  const walk = (n: HastNode) => {
    const kids = n.children ?? [];
    kids.forEach((k, i) => {
      if (!hasClass(k, "katex")) return walk(k);
      const bases = k.children?.find((c) => hasClass(c, "katex-html"))?.children?.filter((c) => hasClass(c, "base"));
      if (!bases?.length) return;
      const prev = kids[i - 1] as TextNode | undefined;
      const open = prev?.type === "text" ? prev.value.match(/[(\[{„‚"'«‹]+$/)?.[0] : undefined;
      if (open) {
        prev!.value = prev!.value.slice(0, -open.length);
        bases[0].children?.unshift(glue(open));
      }
      const next = kids[i + 1] as TextNode | undefined;
      const close = next?.type === "text" ? next.value.match(/^[.,;:!?)\]}“‘"'»›…%‰\-–]+/)?.[0] : undefined;
      if (close) {
        next!.value = next!.value.slice(close.length);
        bases[bases.length - 1].children?.push(glue(close));
      }
    });
  };
  walk(tree);
};

export const remarkPlugins: PluggableList = [remarkGfm, remarkMath];
export const rehypePlugins: PluggableList = [rehypeRaw, [rehypeSanitize, schema], [rehypeKatex, { macros }], rehypeGlueMath, rehypeMarkOrder];

const VULGAR: Record<string, string> = {
  "½": "\\frac{1}{2}", "⅓": "\\frac{1}{3}", "⅔": "\\frac{2}{3}", "¼": "\\frac{1}{4}", "¾": "\\frac{3}{4}",
  "⅕": "\\frac{1}{5}", "⅖": "\\frac{2}{5}", "⅗": "\\frac{3}{5}", "⅘": "\\frac{4}{5}", "⅙": "\\frac{1}{6}",
  "⅚": "\\frac{5}{6}", "⅛": "\\frac{1}{8}", "⅜": "\\frac{3}{8}", "⅝": "\\frac{5}{8}", "⅞": "\\frac{7}{8}",
};

/** Fixes TeX that KaTeX would reject or typeset badly. */
function repairTex(tex: string) {
  tex = tex
    .replace(/\\(begin|end)\{(?:align|split)\*?\}/g, "\\$1{aligned}") // align/split only work in display mode
    .replace(/\\(?:begin|end)\{equation\*?\}/g, "")
    .replace(/(?<!\\)%/g, "\\%") // a bare % starts a TeX comment and swallows the rest
    .replace(/\^?\s*°/g, "^{\\circ}")
    .replace(/√(\d+(?:[.,]\d+)?|[a-zA-Z])/g, "\\sqrt{$1}")
    .replace(/√/g, "\\sqrt")
    .replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (c) => VULGAR[c])
    // Czech words typed straight into math (e.g. \frac{dráha}{čas}) as upright text
    .replace(/(?<!\\[a-zA-Z]*)[a-zA-ZÀ-ÖØ-öø-ž]*[À-ÖØ-öø-ž][a-zA-ZÀ-ÖØ-öø-ž]*/g, "\\text{$&}");
  // "|" ends a GFM table cell even inside $…$, so use \vert-style commands (same glyph). Paired bars
  // become \lvert…\rvert, which also fixes the spacing in |-3| (otherwise read as a binary minus);
  // a lone bar is a relation (divides, "such that").
  const bar = /\\left\||\\right\||\\\\|\\\||\\\$|\|/g;
  const bare = (tex.match(bar) ?? []).filter((m) => m === "|").length;
  let n = 0;
  return tex.replace(bar, (m) => {
    if (m === "\\\\") return m;
    if (m === "\\left|") return "\\left\\lvert ";
    if (m === "\\right|") return "\\right\\rvert ";
    if (m === "\\|") return "\\Vert ";
    if (m === "\\$") return "\\char36 "; // a literal \$ would end the math for remark-math
    if (bare === 1) return "\\mid "; // 3 | 12, {x | x > 0}
    if (bare % 2) return "\\vert ";
    return n++ % 2 ? "\\rvert " : "\\lvert ";
  });
}

const OPEN = new Set(["(", "[", "\\{", "\\left", "\\langle", "\\lvert", "\\lfloor", "\\lceil", "\\begin"]);
const CLOSE = new Set([")", "]", "\\}", "\\right", "\\rangle", "\\rvert", "\\rfloor", "\\rceil", "\\end"]);

/**
 * Inline math: fractions are set full size (\dfrac, also when nested) so they stay legible in running
 * text – only those in exponents/indices keep the small size – and lists like "α, β, γ" may wrap
 * after a comma instead of overflowing narrow answer boxes.
 */
function inlineTex(tex: string) {
  const tokens = tex.match(/\\[a-zA-Z]+|\\.|[\s\S]/g) ?? [];
  // per {…} group: inside a script? + whether each upcoming argument is a script
  const levels = [{ small: false, args: [] as boolean[] }];
  let nest = 0;
  let out = "";
  tokens.forEach((t, i) => {
    const level = levels[levels.length - 1];
    if (t === "{") {
      levels.push({ small: level.small || !!level.args.shift(), args: [] });
    } else if (t === "}") {
      if (levels.length > 1) levels.pop();
    } else if (/\s/.test(t)) {
      // whitespace never fills an argument
    } else if (t === "\\frac" || t === "\\binom") {
      const small = level.small || !!level.args.shift();
      out += small ? t : t.replace("\\", "\\d");
      level.args.unshift(small, small); // numerator and denominator
      return;
    } else if (t === "^" || t === "_") {
      level.args = [true];
    } else {
      level.args.shift();
      if (OPEN.has(t)) nest++;
      else if (CLOSE.has(t)) nest = Math.max(0, nest - 1);
    }
    out += t;
    if (t === "," && levels.length === 1 && !nest && /\s/.test(tokens[i + 1] ?? "")) out += "\\allowbreak";
  });
  return out;
}

const TOKEN = /(`+)[\s\S]*?\1|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\\)\$\$[\s\S]+?\$\$|(?<!\\)\$(?:\\.|[^$\\\n])+?\$/g;

/**
 * Normalizes math and highlights before Markdown parsing:
 * - \(…\) and \[…\] (common in AI output) → $…$ and $$…$$,
 * - $$…$$ on its own line becomes a display block; inside a sentence it stays inline in \displaystyle,
 * - TeX is repaired (see repairTex/inlineTex), code spans are left alone,
 * - ==text== → <mark>, also when the highlight contains math,
 * - a number and its % sign stay on one line.
 */
export function preprocess(src: string) {
  const math: string[] = [];
  const hold = (tex: string) => `\u0000${math.push(tex) - 1}\u0000`;
  return src
    .replace(TOKEN, (m, code: string | undefined, offset: number, s: string) => {
      if (code) return hold(m);
      const end = offset + m.length;
      if (m.startsWith("\\[")) m = `$$${m.slice(2, -2)}$$`;
      else if (m.startsWith("\\(")) m = `$${m.slice(2, -2)}$`;
      if (!m.startsWith("$$")) return hold(`$${inlineTex(repairTex(m.slice(1, -1)))}$`);
      const body = repairTex(m.slice(2, -2).trim());
      const lineStart = s.lastIndexOf("\n", offset - 1) + 1;
      const before = s.slice(lineStart, offset);
      const after = s.slice(end).match(/^[^\n]*/)![0];
      if (before.trim() || after.trim()) return hold(`$\\displaystyle ${body.replace(/\s*\n\s*/g, " ")}$`);
      return hold(`$$\n${before}${body.replace(/\n/g, `\n${before}`)}\n${before}$$`);
    })
    .replace(/==([^=\n][^\n]*?)==/g, "<mark>$1</mark>")
    .replace(/(\d) ([%‰])/g, "$1\u00a0$2") // "80 %" never splits across lines
    // "$a$$b$" would read as a $$ delimiter, so adjacent formulas get a word joiner in between
    .replace(/\u0000(\d+)\u0000(?=(\u0000)?)/g, (_, i: string, next?: string) => math[Number(i)] + (next ? "\u2060" : ""));
}
