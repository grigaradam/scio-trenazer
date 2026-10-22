import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { taskTypeMeta } from "@/lib/content/exams";
import { AI } from "@/lib/env";
import type { ResolvedTask } from "@/lib/server/tasks";
import { anthropic } from "./client";
import { taskToPrompt } from "./format";

export function chatSystemPrompt(task: ResolvedTask, userAnswer: string | null) {
  const meta = taskTypeMeta(task.taskType);
  return `Jsi trpělivý lektor přípravy na test OSP (Scio). Student se tě ptá na konkrétní úlohu. Odpovídej česky,
krátce (max. ~120 slov, pokud student nechce víc), konkrétně k této úloze. Používej sokratovský přístup: když student
neví, naveď ho otázkou nebo nápovědou, ale když chce rovnou vysvětlení, dej ho.

Formátování: ==zvýraznění== pro klíčovou myšlenku (střídmě), **tučně** pro pojmy, matematika v KaTeX $...$.
Klíč odpovědi je správný – nezpochybňuj ho. Pokud se student ptá na něco mimo přípravu na zkoušky, slušně ho vrať k úloze.

Typ úlohy: ${meta?.name ?? task.taskType}
${taskToPrompt(task.group)}
${userAnswer ? `\nStudent odpověděl: ${userAnswer}` : ""}`;
}

export function streamChat(task: ResolvedTask, userAnswer: string | null, messages: Anthropic.MessageParam[]) {
  return anthropic().messages.stream({
    model: AI.chatModel,
    max_tokens: 4000,
    output_config: { effort: "low" },
    system: [{ type: "text", text: chatSystemPrompt(task, userAnswer), cache_control: { type: "ephemeral" } }],
    messages,
  });
}
