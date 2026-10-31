import clsx from "clsx";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { PRO_PERKS, type Plan } from "@/lib/plans";

/** Small, quiet plan tag next to the profile. */
export function PlanBadge({ plan, className }: { plan: Plan; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-md px-1.5 py-px text-[10px] font-extrabold uppercase leading-4 tracking-wider",
        plan === "pro"
          ? "bg-gradient-to-r from-brand-600 to-brand-500 text-white"
          : "border border-border text-muted",
        className,
      )}
    >
      {plan}
    </span>
  );
}

/** Lock marker on things Basic can't open. */
export function ProLock({ className, label = "Pro" }: { className?: string; label?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-muted",
        className,
      )}
    >
      <Lock className="h-3 w-3" strokeWidth={2.6} />
      {label}
    </span>
  );
}

/** What a locked screen would give – informative, no call to buy. */
export function ProTeaser({ title, children, perks = true, className }: { title: string; children?: ReactNode; perks?: boolean; className?: string }) {
  return (
    <div className={clsx("rounded-3xl border-2 border-dashed border-border p-5", className)}>
      <div className="flex items-center gap-2 font-display text-lg font-extrabold">
        <Lock className="h-4 w-4 text-muted" strokeWidth={2.6} />
        {title}
      </div>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
      {perks && (
        <ul className="mt-3 space-y-1 text-sm text-muted">
          {PRO_PERKS.map((p) => (
            <li key={p} className="flex gap-2">
              <span className="text-brand-500">✓</span>
              {p}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">Pro ti zapne ten, od koho máš přístup.</p>
    </div>
  );
}
