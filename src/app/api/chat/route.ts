import { z } from "zod";
import { aiErrorResponse, spendBudget } from "@/lib/ai/client";
import { streamChat } from "@/lib/ai/chat";
import { logAiCall } from "@/lib/ai/usage";
import { AI } from "@/lib/env";
import { apiUser } from "@/lib/server/auth";
import { resolveTask } from "@/lib/server/tasks";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 120;

const Body = z.object({
  ref: z.string(),
  userAnswer: z.string().nullable().optional(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .min(1)
    .max(40),
});

/** Opening questions ("Vysvětli mi to jednodušeji" etc.) are shared across students: same text → same cache key. */
const normalizeQuestion = (q: string) =>
  q
    .toLowerCase()
    .replace(/[\s?!.…]+$/u, "")
    .replace(/\s+/g, " ")
    .trim();

const textResponse = (body: BodyInit) =>
  new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

// Streams the tutor's reply as plain text. The reply to a chat's first question is cached for everyone.
export async function POST(req: Request) {
  const { user, error } = await apiUser();
  if (error) return error;
  const body = Body.parse(await req.json());
  const task = await resolveTask(body.ref);
  if (!task) return Response.json({ error: "Úloha nenalezena" }, { status: 404 });

  const admin = createAdminClient();
  const cacheKey =
    body.messages.length === 1
      ? { task_ref: task.ref, question: normalizeQuestion(body.messages[0].content), user_answer: body.userAnswer ?? "" }
      : null;
  if (cacheKey) {
    const { data: cached } = await admin
      .from("chat_cache")
      .select("reply")
      .eq("task_ref", cacheKey.task_ref)
      .eq("question", cacheKey.question)
      .eq("user_answer", cacheKey.user_answer)
      .maybeSingle();
    if (cached) return textResponse(cached.reply);
  }

  const over = await spendBudget(user.id, "chat");
  if (over) return over;

  try {
    const stream = streamChat(task, body.userAnswer ?? null, body.messages);
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        stream.on("text", (delta) => controller.enqueue(encoder.encode(delta)));
        try {
          const final = await stream.finalMessage();
          await logAiCall({ userId: user.id, kind: "chat", model: AI.chatModel, usage: final.usage });
          const reply = final.content.map((b) => (b.type === "text" ? b.text : "")).join("");
          if (cacheKey && final.stop_reason === "end_turn" && reply.trim())
            await admin.from("chat_cache").upsert({ ...cacheKey, reply, model: AI.chatModel });
          if (final.stop_reason === "refusal") controller.enqueue(encoder.encode("\n\n(Na tohle ti bohužel neodpovím.)"));
        } catch (e) {
          console.error("chat stream", e);
          controller.enqueue(encoder.encode("\n\n(Spojení s AI se přerušilo – zkus to znovu.)"));
        }
        controller.close();
      },
      cancel() {
        stream.abort();
      },
    });
    return textResponse(readable);
  } catch (err) {
    return aiErrorResponse(err);
  }
}
