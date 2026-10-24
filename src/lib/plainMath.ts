// Plain-text rendering of Markdown + TeX for places KaTeX can't reach (SVG chart labels, aria labels,
// one-line previews): "$\frac{1}{2} \cdot x^2$" → "1/2 · x²".

const SYMBOLS: Record<string, string> = {
  cdot: "·", cdotp: "·", times: "×", div: "÷", pm: "±", mp: "∓", ast: "∗", star: "⋆", circ: "∘", bullet: "•",
  le: "≤", leq: "≤", leqslant: "≤", ge: "≥", geq: "≥", geqslant: "≥", ne: "≠", neq: "≠", approx: "≈", doteq: "≐",
  sim: "∼", simeq: "≃", cong: "≅", equiv: "≡", propto: "∝", ll: "≪", gg: "≫", mid: "|", nmid: "∤", parallel: "∥",
  perp: "⊥", angle: "∠", measuredangle: "∡", triangle: "△", square: "□", infty: "∞", partial: "∂", nabla: "∇",
  in: "∈", notin: "∉", ni: "∋", subset: "⊂", subseteq: "⊆", supset: "⊃", supseteq: "⊇", cup: "∪", cap: "∩",
  setminus: "∖", emptyset: "∅", varnothing: "∅", forall: "∀", exists: "∃", nexists: "∄", neg: "¬", lnot: "¬",
  land: "∧", wedge: "∧", lor: "∨", vee: "∨", to: "→", rightarrow: "→", leftarrow: "←", mapsto: "↦",
  Rightarrow: "⇒", implies: "⇒", Leftarrow: "⇐", Leftrightarrow: "⇔", iff: "⇔", leftrightarrow: "↔",
  ldots: "…", dots: "…", cdots: "⋯", vdots: "⋮", langle: "⟨", rangle: "⟩", lvert: "|", rvert: "|", vert: "|",
  lVert: "‖", rVert: "‖", Vert: "‖", lfloor: "⌊", rfloor: "⌋", lceil: "⌈", rceil: "⌉", "{": "{", "}": "}",
  "%": "%", "$": "$", "&": "&", "#": "#", _: "_", ",": " ", ";": " ", ":": " ", " ": " ", "!": "", quad: " ",
  qquad: "  ", degree: "°", prime: "′", alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε",
  varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ",
  nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ", phi: "ϕ", varphi: "φ", chi: "χ",
  psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ",
  Phi: "Φ", Psi: "Ψ", Omega: "Ω", sum: "∑", prod: "∏", int: "∫", N: "ℕ", Z: "ℤ", Q: "ℚ", R: "ℝ", C: "ℂ",
  allowbreak: "", displaystyle: "", textstyle: "", left: "", right: "", big: "", Big: "", bigl: "", bigr: "",
  Bigl: "", Bigr: "", limits: "", nolimits: "", label: "", "\\": " ", veebar: "⊻", celsius: "°C", textdegree: "°",
  napprox: "≉", cotan: "cotg", sgn: "sgn", lcm: "lcm",
};
const BB: Record<string, string> = { N: "ℕ", Z: "ℤ", Q: "ℚ", R: "ℝ", C: "ℂ" };
const SUP: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "−": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ", x: "ˣ", "°": "°", "∘": "°", "′": "′",
};
const SUB: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "−": "₋", "=": "₌", "(": "₍", ")": "₎", a: "ₐ", e: "ₑ", o: "ₒ", x: "ₓ", i: "ᵢ", n: "ₙ", k: "ₖ",
};
const NAMED = /^(sin|cos|tan|tg|cot|cotg|log|ln|lg|exp|lim|max|min|sup|inf|gcd|det|mod|bmod|arcsin|arccos|arctan|arctg)$/;

/** Reads one argument: {group} or a single token. */
function arg(s: string, i: number): [string, number] {
  while (s[i] === " ") i++;
  if (s[i] === "{") {
    let depth = 0;
    for (let j = i; j < s.length; j++) {
      if (s[j] === "\\") j++;
      else if (s[j] === "{") depth++;
      else if (s[j] === "}" && --depth === 0) return [s.slice(i + 1, j), j + 1];
    }
    return [s.slice(i + 1), s.length];
  }
  const m = s.slice(i).match(/^\\[a-zA-Z]+|^\\.|^./);
  return m ? [m[0], i + m[0].length] : ["", i];
}

/** Parenthesizes anything but a number, a word or an already bracketed group. */
const wrap = (x: string) => (/^(\d+([.,]\d+)?|\p{L}+|√?\(.*\))$/u.test(x) && !/\).*\(/.test(x) ? x : `(${x})`);
const script = (x: string, map: Record<string, string>, mark: string) =>
  [...x].every((c) => map[c]) ? [...x].map((c) => map[c]).join("") : `${mark}${[...x].length > 1 ? `(${x})` : x}`;

function tex(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; ) {
    const c = s[i];
    if (c === "\\") {
      const m = s.slice(i).match(/^\\([a-zA-Z]+|.)/);
      const cmd = m ? m[1] : "";
      i += m ? m[0].length : 1;
      if (/^([dtc]?frac|sfrac|nicefrac|[dt]?binom)$/.test(cmd)) {
        const [a, j] = arg(s, i);
        const [b, k] = arg(s, j);
        i = k;
        if (/[\p{L}\p{N}]$/u.test(out)) out += " "; // 2\frac{1}{3} → "2 1/3"
        out += cmd.includes("binom") ? `C(${tex(a)}, ${tex(b)})` : `${wrap(tex(a))}/${wrap(tex(b))}`;
      } else if (cmd === "not") {
        const [a, j] = arg(s, i);
        i = j;
        out += tex(a) + "\u0338";
      } else if (cmd === "abs" || cmd === "norm") {
        const [a, j] = arg(s, i);
        i = j;
        out += cmd === "abs" ? `|${tex(a)}|` : `‖${tex(a)}‖`;
      } else if (cmd === "SI") {
        const [a, j] = arg(s, i);
        const [b, k] = arg(s, j);
        i = k;
        out += `${tex(a)} ${b}`;
      } else if (cmd === "sqrt") {
        let index = "";
        if (s[i] === "[") {
          const end = s.indexOf("]", i);
          index = script(tex(s.slice(i + 1, end)), SUP, "");
          i = end + 1;
        }
        const [a, j] = arg(s, i);
        i = j;
        out += `${index}√${wrap(tex(a))}`;
      } else if (/^(text|textrm|textbf|textit|mathrm|mathbf|mathit|mathsf|operatorname|boldsymbol|mbox|hbox|underline|boxed|color|underbrace|overbrace|unit|si)$/.test(cmd)) {
        let [a, j] = arg(s, i);
        if (cmd === "color") [a, j] = arg(s, j); // \color{red}{x}
        i = j;
        out += /^(text|mbox|hbox|unit|si)/.test(cmd) ? a.replace(/\\(.)/g, "$1") : tex(a);
      } else if (cmd === "mathbb") {
        const [a, j] = arg(s, i);
        i = j;
        out += BB[a] ?? a;
      } else if (/^(overline|bar|vec|overrightarrow|hat|widehat|tilde|dot|ddot|overset|underset|arc|overarc|vv|cancel|phantom)$/.test(cmd)) {
        let [a, j] = arg(s, i);
        if (cmd === "overset" || cmd === "underset") [a, j] = arg(s, j);
        i = j;
        const x = tex(a);
        if (cmd === "phantom") continue;
        const mark = { overline: "̅", bar: "̅", vec: "⃗", overrightarrow: "⃗", vv: "⃗", hat: "̂", widehat: "̂", tilde: "̃", dot: "̇", ddot: "̈" }[cmd];
        out += mark && [...x].length === 1 ? x + mark : mark === "̅" ? [...x].map((ch) => ch + mark).join("") : x;
      } else if (cmd === "begin" || cmd === "end") {
        const [, j] = arg(s, i);
        i = j;
        if (s[i] === "{" && cmd === "begin") i = arg(s, i)[1]; // array column spec
        out += " ";
      } else if (NAMED.test(cmd)) {
        out += cmd === "bmod" ? " mod " : cmd + (/^[a-zA-Z\\]/.test(s[i] ?? "") ? " " : "");
      } else if (cmd === "pmod") {
        const [a, j] = arg(s, i);
        i = j;
        out += ` (mod ${tex(a)})`;
      } else if (cmd === "char") {
        const m2 = s.slice(i).match(/^\s*"?(\d+)\s?/);
        if (m2) {
          out += String.fromCharCode(Number(m2[1]));
          i += m2[0].length;
        }
      } else out += SYMBOLS[cmd] ?? cmd;
    } else if (c === "^" || c === "_") {
      const [a, j] = arg(s, i + 1);
      i = j;
      const x = a === "\\circ" ? "°" : a === "\\prime" ? "′" : tex(a);
      out += x === "°" || x === "′" ? x : script(x, c === "^" ? SUP : SUB, c);
    } else {
      if (c !== "{" && c !== "}") out += c === "&" ? " " : c;
      i++;
    }
  }
  return out;
}

const MATH = /((?<!\\)\$\$[\s\S]+?\$\$|(?<!\\)\$(?:\\.|[^$\\])+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/;

/** Markdown with $…$ math → readable one-line plain text. */
export function toPlainText(src: string) {
  return src
    .split(MATH)
    .map((part, i) => {
      if (i % 2) {
        const body = part.startsWith("$$") || /^\\[[(]/.test(part) ? part.slice(2, -2) : part.slice(1, -1);
        return tex(body.replace(/√\{/g, "\\sqrt{")).replace(/\s+/g, " ").trim();
      }
      return part
        .replace(/\\\$/g, "$")
        .replace(/<\/?[a-zA-Z][^>]*>/g, "")
        .replace(/\*\*|__|==|\[\[|\]\]/g, "")
        .replace(/(^|[\s(])[*_](\S(?:[^*_]*\S)?)[*_](?=[\s.,;:!?)]|$)/g, "$1$2");
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}
