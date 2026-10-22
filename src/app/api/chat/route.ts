import { z } from "zod";
import { aiErrorResponse, spendBudget } from "@/lib/ai/client";
import { streamChat } from "@/lib/ai/chat";
import { logAiCall } from "@/lib/ai/usage";
import { AI } from "@/lib/env";
import { apiUser } from "@/lib/server/auth";
import { resolveTask } from "@/lib/server/tasks";

export const maxDuration = 120;

const Body = z.object({
  ref: z.string(),
  userAnswer: z.string().nullable().optional(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .min(1)
    .max(40),
});

// Streams the tutor's reply as plain text.
export async function POST(req: Request) {
  const { user, error } = await apiUser();
  if (error) return error;
  const body = Body.parse(await req.json());
  const task = await resolveTask(body.ref);
  if (!task) return Response.json({ error: "Úloha nenalezena" }, { status: 404 });
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
          await logAiCall({ userId: user.id, kind: "chat", model: AI.model, usage: final.usage });
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
    return new Response(readable, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (err) {
    return aiErrorResponse(err);
  }
}
