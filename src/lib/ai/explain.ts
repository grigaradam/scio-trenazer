import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { taskTypeMeta } from "@/lib/content/exams";
import { AI } from "@/lib/env";
import type { TaskType } from "@/lib/content/types";
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

/** Bump when the explanation format changes; cached explanations of QUOTE_TYPES older than this get regenerated. */
export const EXPLAIN_VERSION = 2;

const QUOTE_RULES = `Citace z textu: kdykoli se odvoláváš na konkrétní místo výchozího textu, napiš ho jako [[doslovnou citaci]] ve dvojitých
hranatých závorkách – přesně jak stojí v textu (stejná slova, tvary i interpunkce, bez uvozovek kolem). Aplikace to místo v textu
podtrhne a student na citaci může kliknout. Cituj krátce (část věty, nejvýš jednu větu); delší pasáž zkrať „…“ uprostřed.
Cituj jen výchozí text úlohy, ne zadání otázky ani znění možností. Do citace nevkládej ==zvýraznění== ani **tučné**.`;

/** How each task type uses [[quotes]]; only these types get them (see lib/quotes.ts). */
const QUOTE_TYPE_RULES: Partial<Record<TaskType, string>> = {
  nesoulad: `U nesouladu v kroku řešení nejdřív cituj věty, které nesou celkové vyznění textu, pak nesouladnou větu
a ukaž, se kterou konkrétní větou je v rozporu (cituj obě).`,
  vyplyvani: `U správné možnosti cituj přesně tu část textu, ze které tvrzení nutně plyne. U chybných možností cituj místo,
kde text říká méně nebo něco jiného, než možnost tvrdí (např. „některé“ × „všechny“, domněnka × fakt); když tvrzení v textu
vůbec není, napiš to bez citace.`,
  porozumeni: `Ke správné odpovědi cituj místo v textu, kde se odpověď nachází (u delšího textu klidně z více odstavců).
U otázek na fakt × domněnku cituj slova, která domněnku prozrazují (např. „zřejmě“, „domnívá se“); u otázek na funkci části
textu cituj začátek té části. U chybných možností cituj místo, které je vyvrací nebo které přehánějí.`,
  dva_texty: `Před každou citací uveď, ze kterého textu je („v Textu 1 …“, „v Textu 2 …“). Postoje autorů srovnávej vždy
citací z obou textů vedle sebe; u „co plyne z obou“ ukaž citací oporu v každém z nich, u lákavého distraktoru ukaž, že
oporu má jen v jednom.`,
  podminky: `Každou podmínku, kterou v úvaze použiješ, cituj z výchozího textu (stačí její rozhodující část). U chybných
možností cituj podmínku, kterou porušují, nebo ukaž, proč nestačí k jednoznačnému určení.`,
};
export const QUOTE_TYPES = Object.keys(QUOTE_TYPE_RULES) as TaskType[];

export async function generateExplanation(task: ResolvedTask, userId?: string): Promise<Explanation> {
  const meta = taskTypeMeta(task.taskType);
  const typeRules = QUOTE_TYPE_RULES[task.taskType];
  const rules = typeRules ? `${QUOTE_RULES}\n\n${typeRules}` : "";
  const response = await anthropic().messages.parse({
    model: AI.explainModel,
    max_tokens: 8000,
    output_config: { effort: "medium", format: zodOutputFormat(ExplanationSchema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Typ úlohy: ${meta?.name ?? task.taskType} – ${meta?.description ?? ""}\n\n${taskToPrompt(task.group)}\n\n${rules ? `${rules}\n\n` : ""}Vysvětli tuto úlohu.`,
      },
    ],
  });
  await logAiCall({ userId, kind: "explain", model: AI.explainModel, usage: response.usage, ok: Boolean(response.parsed_output) });
  if (!response.parsed_output) throw new Error(`Explanation parse failed (stop_reason ${response.stop_reason})`);
  return response.parsed_output;
}
