"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { startNavProgress } from "./NavProgress";
import { Button } from "./ui";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState(params.get("code") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("error") === "confirm"
      ? "Odkaz pro potvrzení vypršel. Zkus se přihlásit."
      : params.get("error") === "gone"
        ? "Tenhle účet už neexistuje. Přihlas se jiným, nebo se zaregistruj znovu."
        : null,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        startNavProgress();
        router.replace(params.get("next") ?? "/app");
        router.refresh();
      } else {
        const r = await fetch("/api/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name, code }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? "Registrace se nepovedla.");
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        startNavProgress();
        router.replace("/app/onboarding");
        router.refresh();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(translate(msg));
    } finally {
      setBusy(false);
    }
  }

  const input =
    "h-12 w-full rounded-2xl border-2 border-border bg-surface px-4 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15";
  return (
    <form onSubmit={submit} className="space-y-3">
      {mode === "signup" && (
        <input className={input} placeholder="Jak ti máme říkat?" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      )}
      <input className={input} type="email" required autoComplete="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input
        className={input}
        type="password"
        required
        minLength={6}
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        placeholder="Heslo (min. 6 znaků)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {mode === "signup" && (
        <input
          className={input}
          required
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Přístupový kód (XXXX-XXXX)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      )}
      {error && <p className="rounded-xl bg-rose-100 px-3 py-2 text-sm font-medium text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">{error}</p>}
      <Button type="submit" size="lg" className="w-full" loading={busy}>
        {busy ? (mode === "login" ? "Přihlašuji…" : "Zakládám účet…") : mode === "login" ? "Přihlásit se" : "Vytvořit účet"}
      </Button>
      <p className="pt-2 text-center text-sm text-muted">
        {mode === "login" ? (
          <>
            Ještě nemáš účet?{" "}
            <Link href="/signup" className="font-bold text-brand-600">
              Zaregistruj se
            </Link>
          </>
        ) : (
          <>
            Už máš účet?{" "}
            <Link href="/login" className="font-bold text-brand-600">
              Přihlas se
            </Link>
          </>
        )}
      </p>
    </form>
  );
}

function translate(msg: string) {
  if (/Invalid login credentials/i.test(msg)) return "Špatný e-mail nebo heslo.";
  if (/Email not confirmed/i.test(msg)) return "E-mail ještě není potvrzený – klikni na odkaz v e-mailu.";
  if (/already registered/i.test(msg)) return "Tento e-mail už je zaregistrovaný. Přihlas se.";
  if (/Password should be/i.test(msg)) return "Heslo je moc slabé (min. 6 znaků).";
  if (/rate limit/i.test(msg)) return "Moc pokusů za sebou, zkus to za chvíli.";
  return msg;
}
