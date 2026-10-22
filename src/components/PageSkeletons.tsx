import { Skeleton } from "./ui";

function Title({ sub = true }: { sub?: boolean }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-9 w-64 max-w-full" />
      {sub && <Skeleton className="h-4 w-96 max-w-full" />}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-busy>
      <Title />
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 rounded-3xl" />
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 rounded-3xl" />
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-48 rounded-3xl" />
        <Skeleton className="h-48 rounded-3xl" />
      </div>
    </div>
  );
}

export function CardGridSkeleton({ cards = 6, tall = false }: { cards?: number; tall?: boolean }) {
  return (
    <div className="space-y-6" aria-busy>
      <Title />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }, (_, i) => (
          <Skeleton key={i} className={`${tall ? "h-44" : "h-32"} rounded-3xl`} />
        ))}
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-6" aria-busy>
      <Title />
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-3xl" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    </div>
  );
}

export function ResultsSkeleton() {
  return (
    <div className="space-y-8" aria-busy>
      <Skeleton className="h-4 w-56" />
      <div className="grid gap-4 md:grid-cols-[auto_1fr]">
        <Skeleton className="h-36 w-full rounded-3xl md:w-80" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-36 rounded-3xl" />
          <Skeleton className="h-36 rounded-3xl" />
        </div>
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 33 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-10 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function ProgressSkeleton() {
  return (
    <div className="space-y-8" aria-busy>
      <Title sub={false} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-3xl" />
        ))}
      </div>
      <Skeleton className="h-40 rounded-3xl" />
      <Skeleton className="h-64 rounded-3xl" />
    </div>
  );
}

export function TaskSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      <Skeleton className="h-20" />
      <div className="space-y-3 rounded-3xl border-2 border-border bg-surface p-5">
        <Skeleton className="h-5 w-11/12" />
        <Skeleton className="h-5 w-3/4" />
        <div className="grid gap-2 pt-2 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Full-screen loader with a playful animated mark (test runner, onboarding). */
export function FullScreenLoader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4" aria-busy>
      <div className="flex flex-col items-center text-center">
        <div className="relative h-20 w-20">
          <div className="absolute inset-0 animate-ping rounded-3xl bg-brand-400/30" />
          <div className="relative grid h-20 w-20 animate-bounce place-items-center rounded-3xl bg-gradient-to-br from-brand-500 to-analytic-500 font-display text-4xl font-black text-white shadow-[0_6px_0_0_var(--color-brand-800)]">
            S
          </div>
        </div>
        <div className="mt-8 font-display text-2xl font-extrabold">{title}</div>
        {subtitle && <div className="mt-1 text-muted">{subtitle}</div>}
        <div className="mt-5 flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-2.5 w-2.5 animate-bounce rounded-full bg-brand-500" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      </div>
    </main>
  );
}
