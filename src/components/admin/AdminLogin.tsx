"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "../Logo";
import { Button } from "../ui";

export function AdminLogin() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input =
    "h-12 w-full rounded-2xl border-2 border-border bg-surface px-4 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15";
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="mb-8">
        <Logo />
      </div>
      <form
        className="w-full max-w-sm space-y-3 rounded-3xl border-2 border-border bg-surface p-6 shadow-xl"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const r = await fetch("/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) {
            setError(j.error ?? "Přihlášení selhalo.");
            setBusy(false);
            return;
          }
          router.refresh();
        }}
      >
        <h1 className="font-display text-2xl font-extrabold">Admin 🛠️</h1>
        <input className={input} placeholder="Jméno" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <input
          className={input}
          type="password"
          placeholder="Heslo"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="rounded-xl bg-rose-100 px-3 py-2 text-sm font-medium text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">{error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          Přihlásit
        </Button>
      </form>
    </main>
  );
}
