import type { ChartSpec, Group, Question } from "@/lib/content/types";

const CHART_KIND: Record<ChartSpec["kind"], string> = {
  bar: "sloupcový graf",
  stacked: "skládaný sloupcový graf",
  line: "spojnicový graf",
  pie: "koláčový graf",
};

export function chartToText(c: ChartSpec) {
  const lines = [`Graf (${CHART_KIND[c.kind]})${c.title ? `: ${c.title}` : ""}`];
  if (c.xLabel || c.yLabel) lines.push(`Osy: x = ${c.xLabel ?? "–"}, y = ${c.yLabel ?? "–"}${c.unit ? ` [${c.unit}]` : ""}`);
  for (const s of c.series) lines.push(`${s.name}: ${c.categories.map((cat, i) => `${cat} = ${s.values[i]}`).join(", ")}`);
  return lines.join("\n");
}

/** Plain-text rendering of a task for prompts. withKey adds answers + solution. */
export function taskToPrompt(group: Group, questions: Question[] = group.questions, withKey = true) {
  const lines: string[] = [];
  lines.push(`Instrukce: ${group.instruction}`);
  if (group.passageTitle) lines.push(group.passageTitle);
  if (group.passage) lines.push(`Společný text:\n${group.passage}`);
  if (group.figure) lines.push(`(Úloha obsahuje obrázek/graf, který tu není k dispozici.)`);
  if (group.chart) lines.push(chartToText(group.chart));
  questions.forEach((q, qi) => {
    lines.push(`\n--- Úloha ${questions.length > 1 ? qi + 1 : ""}`.trimEnd());
    if (q.stem) lines.push(q.stem);
    if (q.compare) lines.push(`Vlevo: ${q.compare.left}\nVpravo: ${q.compare.right}`);
    if (q.figure) lines.push(`(Úloha obsahuje obrázek, který tu není k dispozici.)`);
    for (const p of q.parts) {
      if (p.label) lines.push(`${p.label}:`);
      for (const o of p.options) lines.push(`(${o.key}) ${o.text}`);
      if (withKey) lines.push(`Správně: ${p.answer}`);
    }
    if (withKey && q.solution) lines.push(`Zdůvodnění: ${q.solution}`);
  });
  return lines.join("\n");
}
