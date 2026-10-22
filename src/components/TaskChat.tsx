"use client";

import { MessageCircle, Send } from "lucide-react";
import { useRef, useState } from "react";
import { RichText } from "./RichText";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = ["Proč není správně moje odpověď?", "Vysvětli mi to jednodušeji", "Jak to vyřešit rychleji?", "Dej mi podobný příklad"];

export function TaskChat({ taskRef, userAnswer }: { taskRef: string; userAnswer?: string | null }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: t }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: taskRef, userAnswer: userAnswer ?? null, messages: next }),
      });
      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? "AI neodpověděla.");
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMessages([...next, { role: "assistant", content: acc }]);
        endRef.current?.scrollIntoView({ block: "nearest" });
      }
    } catch (e) {
      setMessages([...next, { role: "assistant", content: `⚠️ ${e instanceof Error ? e.message : "Chyba"}` }]);
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-border bg-surface py-3 font-bold text-brand-700 transition hover:bg-surface-2 dark:text-brand-300"
      >
        <MessageCircle className="h-5 w-5" /> Zeptat se AI lektora
      </button>
    );

  return (
    <div className="rounded-3xl border-2 border-border bg-surface p-3 sm:p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-muted">
        <MessageCircle className="h-4 w-4" /> Chat s AI lektorem
      </div>
      <div className="scroll-thin max-h-[420px] space-y-3 overflow-y-auto pr-1">
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-3 py-2 text-[15px] text-white">
              {m.content}
            </div>
          ) : (
            <div key={i} className="explain w-fit max-w-[92%] rounded-2xl rounded-bl-md bg-surface-2 px-3 py-2 text-[15px]">
              {m.content ? <RichText>{m.content}</RichText> : <span className="animate-pulse text-muted">píše…</span>}
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>
      {messages.length === 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => send(s)} className="rounded-full border-2 border-border px-3 py-1 text-sm font-semibold hover:bg-surface-2">
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Proč je to takhle…?"
          maxLength={1500}
          className="h-11 min-w-0 flex-1 rounded-2xl border-2 border-border bg-surface px-3 outline-none focus:border-brand-500"
        />
        <button
          disabled={busy || !input.trim()}
          className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-600 text-white disabled:opacity-40"
          aria-label="Odeslat"
        >
          <Send className="h-5 w-5" />
        </button>
      </form>
    </div>
  );
}
