import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./Logo";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,var(--color-brand-100),transparent_60%)] px-4 py-10 dark:bg-[radial-gradient(ellipse_at_top,#2a1d4a,transparent_60%)]">
      <Link href="/" className="mb-8">
        <Logo />
      </Link>
      <div className="w-full max-w-sm rounded-3xl border-2 border-border bg-surface p-6 shadow-xl shadow-brand-900/5 animate-fade-up">
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        <p className="mb-5 mt-1 text-sm text-muted">{subtitle}</p>
        {children}
      </div>
    </main>
  );
}
