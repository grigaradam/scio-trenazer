import type { Group, Question } from "@/lib/content/types";

/** Plain-text rendering of a task for prompts. withKey adds answers + solution. */
export function taskToPrompt(group: Group, questions: Question[] = group.questions, withKey = true) {
  const lines: string[] = [];
  lines.push(`Instrukce: ${group.instruction}`);
  if (group.passageTitle) lines.push(group.passageTitle);
  if (group.passage) lines.push(`Společný text:\n${group.passage}`);
  if (group.figure) lines.push(`(Úloha obsahuje obrázek/graf, který tu není k dispozici.)`);
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
