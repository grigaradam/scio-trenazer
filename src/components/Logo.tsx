/** Draft answer bubble (dashed) with a confident check drawn over it – "nanečisto". */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#14b8a6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="19" fill="url(#logo-bg)" />
      <circle cx="29" cy="36" r="15" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="3" strokeDasharray="5 5" strokeLinecap="round" />
      <path d="M20 35.5 28.5 44 49 17" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="49" cy="17" r="3.5" fill="#fde047" />
    </svg>
  );
}

export function Logo({ small }: { small?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark
        className={`rounded-[30%] shadow-[0_3px_0_0_var(--color-brand-800)] ${small ? "h-8 w-8" : "h-10 w-10"}`}
      />
      <span className={`font-display font-extrabold tracking-tight ${small ? "hidden text-lg sm:inline" : "text-2xl"}`}>
        nane<span className="text-brand-600 dark:text-brand-400">čisto</span>
      </span>
    </span>
  );
}
