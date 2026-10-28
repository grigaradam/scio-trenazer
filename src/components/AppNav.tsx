"use client";

import clsx from "clsx";
import { Dumbbell, FileText, Home, Target, TrendingUp, User, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";

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

/**
 * Press and slide along the dock like the iOS tab bar: the lens follows the finger, the tab
 * under it lights up, and letting go opens it. A plain tap still goes through the Link.
 */
function useDockDrag(onPick: (idx: number) => void) {
  const pillRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; startX: number; moved: boolean; idx: number } | null>(null);
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState<{ x: number; idx: number } | null>(null);

  // geometry is read per event so rotation / resize never goes stale
  const locate = (clientX: number) => {
    const rect = pillRef.current!.getBoundingClientRect();
    const pad = 6; // p-1.5
    const inner = rect.width - pad * 2;
    const cell = inner / NAV.length;
    const x = Math.min(Math.max(clientX - rect.left - pad - cell / 2, 0), inner - cell);
    return { x, idx: Math.min(NAV.length - 1, Math.max(0, Math.round(x / cell))) };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // touch drags often fire no click at all, so a leftover flag must not eat this new tap
    suppressClick.current = false;
    drag.current = { id: e.pointerId, startX: e.clientX, moved: false, idx: -1 };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved) {
      if (Math.abs(e.clientX - d.startX) < 8) return;
      d.moved = true;
      // capture only once it is a drag, so taps keep reaching the Link underneath
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const { x, idx } = locate(e.clientX);
    if (idx !== d.idx) {
      d.idx = idx;
      navigator.vibrate?.(8);
    }
    setDragging({ x, idx });
  };

  const end = (e: PointerEvent<HTMLDivElement>, commit: boolean) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    suppressClick.current = true;
    if (commit) onPick(d.idx);
    // without a drag offset the lens springs back onto the chosen tab
    setDragging(null);
  };

  const onClickCapture = (e: MouseEvent) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  return {
    pillRef,
    dragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (e: PointerEvent<HTMLDivElement>) => end(e, true),
      onPointerCancel: (e: PointerEvent<HTMLDivElement>) => end(e, false),
      onClickCapture,
    },
  };
}

export function BottomNav({ badge, avatar }: { badge?: number; avatar?: string | null }) {
  const router = useRouter();
  const { path, pending, setPending } = usePendingNav();
  const [picked, setPicked] = useState<number | null>(null);
  const { pillRef, dragging, handlers } = useDockDrag((idx) => {
    const { href } = NAV[idx];
    if (isActive(currentPath(), href)) return;
    setPicked(idx);
    setPending(href);
    router.push(href);
  });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPicked(null);
  }, [path]);

  const routeIdx = NAV.findIndex(({ href }) => isActive(path, href));
  const dragIdx = dragging?.idx ?? null;
  const shownIdx = dragIdx ?? picked ?? routeIdx;
  return (
    // floating liquid-glass pill; height and gap come from --dock-h / --dock-gap so other bars can sit above it
    <nav className="pointer-events-none fixed inset-x-0 bottom-[var(--dock-gap)] z-30 px-3 lg:hidden">
      <div
        ref={pillRef}
        {...handlers}
        className="liquid-glass pointer-events-auto relative mx-auto grid h-[var(--dock-h)] max-w-md touch-none select-none grid-cols-6 rounded-full p-1.5 [-webkit-touch-callout:none]"
      >
        <span
          aria-hidden
          className={clsx("liquid-lens absolute inset-y-1.5 left-1.5 rounded-full", dragging && "is-dragging")}
          style={{
            width: `calc((100% - 0.75rem) / ${NAV.length})`,
            transform: dragging
              ? `translateX(${dragging.x}px) scale(1.12)`
              : `translateX(${Math.max(shownIdx, 0) * 100}%)`,
            opacity: shownIdx < 0 ? 0 : 1,
          }}
        />
        {NAV.map(({ href, label, icon }, i) => {
          const on = i === shownIdx;
          return (
            <Link
              key={href}
              href={href}
              draggable={false}
              onClick={() => !isActive(currentPath(), href) && setPending(href)}
              className={clsx(
                "relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-bold leading-none transition-[transform,color] duration-200",
                dragIdx === null && "active:scale-90",
                dragIdx === i && "scale-110",
                pending === href && "animate-pulse",
                on ? "text-brand-600 dark:text-brand-200" : "text-muted",
              )}
            >
              <NavIcon href={href} icon={icon} avatar={avatar} active={on} className="h-[22px] w-[22px]" strokeWidth={on ? 2.6 : 2} />
              <span className="max-w-full truncate px-0.5">{label}</span>
              {href === "/app/mistakes" && badge ? (
                <span className="absolute right-[18%] top-1.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white dark:ring-surface" />
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// current real pathname at click time (pending may already point elsewhere)
function currentPath() {
  return typeof window === "undefined" ? "" : window.location.pathname;
}
