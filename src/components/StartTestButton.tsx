"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "./ui";

export function StartTestButton({
  testId,
  diagnostic,
  children,
  variant = "primary",
  size = "md",
  className,
}: {
  testId?: string;
  diagnostic?: boolean;
  children: ReactNode;
  variant?: "primary" | "secondary";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={className}>
      <Button
        variant={variant}
        size={size}
        className="w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const r = await fetch("/api/attempts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ testId, diagnostic }),
          });
          const j = await r.json();
          if (!r.ok) {
            setError(j.error ?? "Chyba");
            setBusy(false);
            return;
          }
          router.push(`/app/test/${j.id}`);
        }}
      >
        {busy ? "Připravuji…" : children}
      </Button>
      {error && <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}
