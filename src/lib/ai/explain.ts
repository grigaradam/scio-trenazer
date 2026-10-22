import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { taskTypeMeta } from "@/lib/content/exams";
import { AI } from "@/lib/env";
import type { ResolvedTask } from "@/lib/server/tasks";
import { anthropic } from "./client";
import { taskToPrompt } from "./format";
import { logAiCall } from "./usage";

export const ExplanationSchema = z.object({
  verdict: z.string().describe("Jedna věta: která odpověď je správná a proč (s ==zvýrazněním== klíčového důvodu)."),
  steps: z
    .array(z.object({ title: z.string(), body: z.string() }))
    .describe("2–5 kroků řešení jako řešený příklad. Markdown, ==zvýraznění== jen u nejdůležitějších míst, **klíčové pojmy**, KaTeX $...$."),
  options: z
    .array(z.object({ key: z.string(), correct: z.boolean(), why: z.string() }))
    .describe("Ke každé možnosti 1 krátká věta, proč je/není správná."),
  trap: z.string().describe("Na co se v této úloze nachytá nejvíc lidí."),
  tip: z.string().describe("Obecný přenositelný tip pro tento typ úloh (1–2 věty)."),
});
export type Explanation = z.infer<typeof ExplanationSchema>;

const SYSTEM = `Jsi zkušený lektor přípravy na Národní srovnávací zkoušky Scio (test OSP). Vysvětluješ úlohy studentům česky,
přátelsky, stručně a přesně. Vysvětlení stav jako řešený příklad (worked example) krok za krokem.

Zásady zvýrazňování (vychází z výzkumu signaling principle a von Restorffova efektu):
- ==text== = žlutý zvýrazňovač. Použij ho střídmě: 1–2× na krok, jen na rozhodující myšlenku, číslo nebo slovo z textu.
  Když zvýrazňuješ všechno, nezvýrazňuješ nic.
- **tučně** = klíčový pojem nebo pravidlo (např. **vyplývá nutně**, **pořadí ve dvojici**).
- Matematiku piš v KaTeX: inline $\\frac{2}{3}$, desetinná čárka $4{,}5$.
- Žádné nadpisy, žádné úvody typu „Skvělá otázka“. Krátké věty.
Správná odpověď je daná klíčem – nikdy ji nezpochybňuj, vysvětli, proč platí.`;

export async function generateExplanation(task: ResolvedTask, userId?: string): Promise<Explanation> {
  const meta = taskTypeMeta(task.taskType);
  const response = await anthropic().messages.parse({
    model: AI.explainModel,
    max_tokens: 8000,
    output_config: { effort: "medium", format: zodOutputFormat(ExplanationSchema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Typ úlohy: ${meta?.name ?? task.taskType} – ${meta?.description ?? ""}\n\n${taskToPrompt(task.group)}\n\nVysvětli tuto úlohu.`,
      },
    ],
  });
  await logAiCall({ userId, kind: "explain", model: AI.explainModel, usage: response.usage, ok: Boolean(response.parsed_output) });
  if (!response.parsed_output) throw new Error(`Explanation parse failed (stop_reason ${response.stop_reason})`);
  return response.parsed_output;
}
