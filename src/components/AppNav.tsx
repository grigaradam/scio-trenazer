"use client";

import clsx from "clsx";
import { Dumbbell, FileText, Home, Target, TrendingUp, User, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export const NAV = [
  { href: "/app", label: "Domů", icon: Home },
  { href: "/app/tests", label: "Testy", icon: FileText },
  { href: "/app/practice", label: "Trénink", icon: Dumbbell },
  { href: "/app/mistakes", label: "Slabiny", icon: Target },
  { href: "/app/progress", label: "Pokrok", icon: TrendingUp },
  { href: "/app/profile", label: "Profil", icon: User },
];

/** The profile item shows the user's picture instead of the generic icon once they have set one. */
function NavIcon({ href, icon: Icon, avatar, active, className, strokeWidth }: {
  href: string;
  icon: LucideIcon;
  avatar?: string | null;
  active: boolean;
  className: string;
  strokeWidth: number;
}) {
  if (href !== "/app/profile" || !avatar) return <Icon className={className} strokeWidth={strokeWidth} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatar}
      alt=""
      className={clsx(
        className,
        "shrink-0 rounded-full object-cover ring-2 ring-offset-1 ring-offset-transparent",
        active ? "ring-brand-500 dark:ring-brand-300" : "ring-border",
      )}
    />
  );
}

const isActive = (path: string, href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));

/** The tapped item lights up immediately and pulses until the new page arrives. */
function usePendingNav() {
  const path = usePathname();
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPending(null);
  }, [path]);
  return { path: pending ?? path, pending, setPending };
}

export function SideNav({ badge, avatar }: { badge?: number; avatar?: string | null }) {
  const { path, pending, setPending } = usePendingNav();
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon }) => (
        <Link
          key={href}
          href={href}
          onClick={() => !isActive(currentPath(), href) && setPending(href)}
          className={clsx(
            "flex items-center gap-3 rounded-2xl border-2 px-4 py-3 font-bold uppercase tracking-wide text-[13px] transition",
            pending === href && "animate-pulse",
            isActive(path, href)
              ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-200"
              : "border-transparent text-muted hover:bg-surface-2 hover:text-text",
          )}
        >
          <NavIcon href={href} icon={icon} avatar={avatar} active={isActive(path, href)} className="h-5 w-5" strokeWidth={2.4} />
          {label}
          {href === "/app/mistakes" && badge ? (
            <span className="ml-auto rounded-full bg-rose-500 px-2 py-0.5 text-[11px] text-white">{badge}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav({ badge, avatar }: { badge?: number; avatar?: string | null }) {
  const { path, pending, setPending } = usePendingNav();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-6">
        {NAV.map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
            onClick={() => !isActive(currentPath(), href) && setPending(href)}
            className={clsx(
              "relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold active:scale-90 transition-transform",
              pending === href && "animate-pulse",
              isActive(path, href) ? "text-brand-600 dark:text-brand-300" : "text-muted",
            )}
          >
            <NavIcon href={href} icon={icon} avatar={avatar} active={isActive(path, href)} className="h-6 w-6" strokeWidth={isActive(path, href) ? 2.6 : 2} />
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

// current real pathname at click time (pending may already point elsewhere)
function currentPath() {
  return typeof window === "undefined" ? "" : window.location.pathname;
}
