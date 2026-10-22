"use client";

import clsx from "clsx";
import { Dumbbell, FileText, Home, Target, TrendingUp, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV = [
  { href: "/app", label: "Domů", icon: Home },
  { href: "/app/tests", label: "Testy", icon: FileText },
  { href: "/app/practice", label: "Trénink", icon: Dumbbell },
  { href: "/app/mistakes", label: "Slabiny", icon: Target },
  { href: "/app/progress", label: "Pokrok", icon: TrendingUp },
  { href: "/app/profile", label: "Profil", icon: User },
];

const isActive = (path: string, href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));

export function SideNav({ badge }: { badge?: number }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={clsx(
            "flex items-center gap-3 rounded-2xl border-2 px-4 py-3 font-bold uppercase tracking-wide text-[13px] transition",
            isActive(path, href)
              ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-200"
              : "border-transparent text-muted hover:bg-surface-2 hover:text-text",
          )}
        >
          <Icon className="h-5 w-5" strokeWidth={2.4} />
          {label}
          {href === "/app/mistakes" && badge ? (
            <span className="ml-auto rounded-full bg-rose-500 px-2 py-0.5 text-[11px] text-white">{badge}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav({ badge }: { badge?: number }) {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-6">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              "relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold",
              isActive(path, href) ? "text-brand-600 dark:text-brand-300" : "text-muted",
            )}
          >
            <Icon className="h-6 w-6" strokeWidth={isActive(path, href) ? 2.6 : 2} />
            {label}
            {href === "/app/mistakes" && badge ? (
              <span className="absolute right-2 top-1 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-surface" />
            ) : null}
          </Link>
        ))}
      </div>
    </nav>
  );
}
