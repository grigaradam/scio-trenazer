import clsx from "clsx";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success" | "verbal" | "analytic";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white shadow-[0_4px_0_0_var(--color-brand-800)] hover:bg-brand-500 active:translate-y-[3px] active:shadow-[0_1px_0_0_var(--color-brand-800)]",
  verbal:
    "bg-verbal-600 text-white shadow-[0_4px_0_0_var(--color-verbal-700)] hover:bg-verbal-500 active:translate-y-[3px] active:shadow-none",
  analytic:
    "bg-analytic-600 text-white shadow-[0_4px_0_0_var(--color-analytic-700)] hover:bg-analytic-500 active:translate-y-[3px] active:shadow-none",
  success:
    "bg-emerald-500 text-white shadow-[0_4px_0_0_#047857] hover:bg-emerald-400 active:translate-y-[3px] active:shadow-none",
  danger: "bg-rose-500 text-white shadow-[0_4px_0_0_#be123c] hover:bg-rose-400 active:translate-y-[3px] active:shadow-none",
  secondary:
    "bg-surface text-text border-2 border-border shadow-[0_3px_0_0_var(--border)] hover:bg-surface-2 active:translate-y-[2px] active:shadow-none",
  ghost: "text-muted hover:text-text hover:bg-surface-2",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-xl",
  md: "h-11 px-5 text-[15px] rounded-2xl",
  lg: "h-14 px-7 text-base rounded-2xl",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return clsx(
    "inline-flex items-center justify-center gap-2 font-bold tracking-wide transition-all select-none disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
    variants[variant],
    sizes[size],
    extra,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={clsx("rounded-3xl border-2 border-border bg-surface p-5", className)} {...props} />;
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "verbal" | "analytic" | "good" | "bad" | "warn";
  className?: string;
}) {
  const tones = {
    neutral: "bg-surface-2 text-muted",
    brand: "bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-200",
    verbal: "bg-verbal-100 text-verbal-700 dark:bg-verbal-700/30 dark:text-violet-200",
    analytic: "bg-analytic-100 text-analytic-700 dark:bg-analytic-700/30 dark:text-teal-200",
    good: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    bad: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    warn: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  };
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold", tones[tone], className)}>
      {children}
    </span>
  );
}

export function ProgressBar({
  value,
  className,
  barClassName = "bg-brand-500",
}: {
  value: number;
  className?: string;
  barClassName?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={clsx("h-3 w-full overflow-hidden rounded-full bg-surface-2", className)}>
      <div className={clsx("h-full rounded-full transition-[width] duration-700 ease-out", barClassName)} style={{ width: `${pct}%` }}>
        <div className="mx-1.5 mt-[3px] h-[3px] rounded-full bg-white/30" />
      </div>
    </div>
  );
}

export function Ring({
  value,
  size = 56,
  stroke = 7,
  color = "var(--color-brand-500)",
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-xs font-bold">{children}</div>
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="font-display text-xl font-bold">{children}</h2>
      {action}
    </div>
  );
}

export function EmptyState({ emoji, title, children }: { emoji: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-border p-8 text-center">
      <div className="text-4xl">{emoji}</div>
      <div className="font-display text-lg font-bold">{title}</div>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}
