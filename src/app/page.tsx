import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ButtonLink } from "@/components/ui";

const features = [
  { emoji: "⏱️", title: "Ostré testy na čas", text: "Celé testy OSP z minulých let. 35 min verbální, 50 min analytický oddíl, bodování jako u Scia." },
  { emoji: "🎯", title: "Přesný rozbor chyb", text: "Uvidíš, kde jsi chyboval(a). Zkus to přepočítat, pak ti AI vysvětlí řešení krok za krokem." },
  { emoji: "🤖", title: "Nekonečný trénink", text: "AI generuje nové úlohy přesně ve stylu Scio. Každá prochází kontrolou kvality." },
  { emoji: "🔥", title: "Streak a XP", text: "Denní cíl, streak, levely a achievementy. Motivace vydržet až do zkoušky." },
  { emoji: "📈", title: "Vidíš svůj pokrok", text: "Heatmapa času, graf skóre, úspěšnost po typech úloh, porovnání testů." },
  { emoji: "🖍️", title: "Učení podle výzkumu", text: "Aktivní vybavování, okamžitá zpětná vazba, zvýraznění podstatného, rozložené opakování." },
];

export default function Home() {
  return (
    <main className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Logo small />
        <div className="flex gap-2">
          <ButtonLink href="/login" variant="ghost" size="sm">
            Přihlásit
          </ButtonLink>
          <ButtonLink href="/signup" size="sm">
            Začít zdarma
          </ButtonLink>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--color-brand-100),transparent_65%)] dark:bg-[radial-gradient(ellipse_at_top,#2a1d4a,transparent_65%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 md:grid-cols-2 md:pt-16">
          <div className="animate-fade-up">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-sm font-bold text-brand-700 shadow-sm ring-1 ring-border dark:text-brand-300">
              🧠 Národní srovnávací zkoušky · OSP
            </span>
            <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
              Natrénuj Scio. <span className="bg-gradient-to-r from-brand-600 to-analytic-500 bg-clip-text text-transparent">Hravě.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted">
              Ostré testy z minulých let, rozbor každé chyby s AI lektorem a nekonečný trénink úloh, které ti nejdou.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/signup" size="lg">
                Začít úvodním testem
              </ButtonLink>
              <ButtonLink href="/login" size="lg" variant="secondary">
                Mám účet
              </ButtonLink>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-md animate-fade-up [animation-delay:150ms]">
            <div className="rounded-3xl border-2 border-border bg-surface p-5 shadow-2xl shadow-brand-900/10">
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="rounded-full bg-verbal-100 px-3 py-1 font-bold text-verbal-700 dark:bg-verbal-700/30 dark:text-violet-200">
                  Verbální oddíl
                </span>
                <span className="font-mono font-bold tabular-nums">31:42</span>
              </div>
              <p className="text-[15px] leading-relaxed">
                Vztahy obou osob se <u className="decoration-2 underline-offset-4">zdánlivě</u> urovnaly.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                {["konečně", "naoko", "očividně", "prozatímně"].map((o, i) => (
                  <div
                    key={o}
                    className={`rounded-2xl border-2 px-3 py-2.5 font-semibold ${i === 1 ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200" : "border-border"}`}
                  >
                    <span className="mr-2 text-muted">{"ABCD"[i]}</span>
                    {o}
                  </div>
                ))}
              </div>
              <div className="rich explain mt-4 rounded-2xl bg-surface-2 p-3 text-sm">
                <mark>„Zdánlivě“ = jen na pohled</mark>, ve skutečnosti ne → synonymum <strong>naoko</strong>.
              </div>
            </div>
            <div className="absolute -right-3 -top-4 rotate-6 rounded-2xl bg-orange-500 px-3 py-2 font-display font-bold text-white shadow-lg">
              🔥 12 dní
            </div>
            <div className="absolute -bottom-4 -left-3 -rotate-6 rounded-2xl bg-brand-600 px-3 py-2 font-display font-bold text-white shadow-lg">
              +10 XP
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="rounded-3xl border-2 border-border bg-surface p-5 animate-fade-up"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="text-3xl">{f.emoji}</div>
              <h3 className="mt-2 font-display text-lg font-bold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted">{f.text}</p>
            </div>
          ))}
        </div>
        <p className="mt-10 text-center text-sm text-muted">
          Připravujeme také ZSV, angličtinu a matematiku. <Link href="/signup" className="font-bold text-brand-600">Založ si účet →</Link>
        </p>
      </section>
    </main>
  );
}
