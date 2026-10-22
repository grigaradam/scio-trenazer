export function Logo({ small }: { small?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`grid place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-analytic-500 font-display font-black text-white shadow-[0_3px_0_0_var(--color-brand-800)] ${small ? "h-8 w-8 text-base" : "h-10 w-10 text-xl"}`}
      >
        N
      </span>
      <span className={`font-display font-extrabold tracking-tight ${small ? "hidden text-lg sm:inline" : "text-2xl"}`}>
        Natrénuj<span className="text-brand-600"> testy</span>
      </span>
    </span>
  );
}
