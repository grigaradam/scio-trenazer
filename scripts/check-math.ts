// Renders every math-bearing string through the exact RichText pipeline and reports KaTeX errors and
// math that leaked out as raw text. Sources: the QA corpus, content JSON, and (with --db) the
// generated pool + cached AI explanations.  Usage: npm run check:math [-- --db | --corpus-only]
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { ALL_SAMPLES } from "../src/components/dev/mathCorpus";
import { preprocess, rehypePlugins, remarkPlugins } from "../src/lib/markdown";

type Node = { type: string; value?: string; tagName?: string; properties?: Record<string, unknown>; children?: Node[] };

const processor = unified().use(remarkParse).use(remarkPlugins).use(remarkRehype, { allowDangerousHtml: true }).use(rehypePlugins);

const cls = (n: Node) => {
  const c = n.properties?.className;
  return Array.isArray(c) ? c.map(String) : [];
};

/** Problems in one rendered string. */
function check(src: string): string[] {
  const issues: string[] = [];
  const file = { value: preprocess(src) } as never;
  let tree: Node;
  const warn = console.warn;
  console.warn = (...a: unknown[]) => issues.push(`katex warning: ${String(a[0]).slice(0, 140)}`);
  try {
    tree = processor.runSync(processor.parse(file), file) as Node;
  } catch (e) {
    return [`pipeline threw: ${(e as Error).message}`];
  } finally {
    console.warn = warn;
  }
  for (const m of (file as { messages?: { reason: string }[] }).messages ?? []) issues.push(`katex: ${m.reason.split("\n")[0]}`);
  const walk = (n: Node, inMath: boolean, inCode: boolean) => {
    const c = cls(n);
    if (c.includes("katex-error")) issues.push(`katex-error span: ${String(n.properties?.title ?? "").slice(0, 120)}`);
    const math = inMath || c.includes("katex");
    const code = inCode || n.tagName === "code";
    if (n.type === "text" && !math && !code && n.value) {
      const t = n.value;
      if (/\$/.test(t) && !src.includes("\\$")) issues.push(`raw "$" in text: «${t.trim().slice(0, 80)}»`);
      if (/\\[a-zA-Z]+|\\[{}(),[\]]/.test(t)) issues.push(`raw TeX command in text: «${t.trim().slice(0, 80)}»`);
      if (/==/.test(t)) issues.push(`unconverted ==mark==: «${t.trim().slice(0, 80)}»`);
    }
    for (const ch of n.children ?? []) walk(ch, math, code);
  };
  walk(tree, false, false);
  return issues;
}

function strings(v: unknown, path: string, out: [string, string][]) {
  if (typeof v === "string") {
    if (/[$\\]|==/.test(v)) out.push([path, v]);
  } else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${path}[${i}]`, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) strings(x, `${path}.${k}`, out);
}

/** globals.css imports katex's stylesheet; it must come from the same KaTeX that renders the HTML. */
function checkKatexVersions() {
  const req = createRequire(import.meta.url);
  const css = req("katex/package.json").version;
  const renderer = createRequire(req.resolve("rehype-katex"))("katex/package.json").version;
  if (css !== renderer) {
    console.log(`✗ KaTeX CSS ${css} ≠ renderer ${renderer} (rehype-katex) – layout breaks; align the "katex" dependency.`);
    process.exit(1);
  }
}

async function main() {
  checkKatexVersions();
  const args = process.argv.slice(2);
  const inputs: [string, string][] = ALL_SAMPLES.map((s, i) => [`corpus#${i}`, s]);
  if (!args.includes("--corpus-only")) {
    for (const f of readdirSync("content/osp/tests")) strings(JSON.parse(readFileSync(`content/osp/tests/${f}`, "utf8")), f, inputs);
  }
  if (args.includes("--db")) {
    const { createClient } = await import("@supabase/supabase-js");
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
    for (const [table, col] of [["generated_tasks", "payload"], ["explanations", "*"]] as const) {
      for (let from = 0; ; from += 1000) {
        const { data, error } = await db.from(table).select(col === "*" ? "*" : `id, ${col}`).range(from, from + 999);
        if (error) throw new Error(`${table}: ${error.message}`);
        for (const row of data ?? []) strings(row, `${table}:${(row as { id?: string }).id ?? from}`, inputs);
        if (!data || data.length < 1000) break;
      }
    }
  }
  let bad = 0;
  for (const [where, src] of inputs) {
    const issues = [...new Set(check(src))];
    if (!issues.length) continue;
    bad++;
    console.log(`\n✗ ${where}\n  src: ${JSON.stringify(src).slice(0, 220)}`);
    for (const i of issues) console.log(`  - ${i}`);
  }
  console.log(`\n${inputs.length} strings checked, ${bad} with problems.`);
  process.exit(bad ? 1 : 0);
}

main();
