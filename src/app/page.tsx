import { Logo } from "@/components/Logo";
import { ButtonLink } from "@/components/ui";

const features = [
  { emoji: "⏱️", title: "Celé testy na čas", text: "Odpočet, oddíly za sebou, bodování se srážkou za chybu. Přesně jako na ostro." },
  { emoji: "🎯", title: "Rozbor každé chyby", text: "Nejdřív si úlohu zkus přepočítat, pak ti AI vysvětlí řešení krok za krokem." },
  { emoji: "🤖", title: "Nekonečný trénink", text: "Nové úlohy na míru tomu, co ti nejde. Každá prochází kontrolou kvality." },
  { emoji: "🔥", title: "Streak a XP", text: "Denní cíl, streak, levely a achievementy – motivace vydržet." },
  { emoji: "📈", title: "Vidíš svůj pokrok", text: "Heatmapa času, graf výsledků, úspěšnost po typech úloh." },
  { emoji: "🖍️", title: "Učení podle výzkumu", text: "Aktivní vybavování, okamžitá zpětná vazba, zvýraznění podstatného." },
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
            Mám pozvánku
          </ButtonLink>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--color-brand-100),transparent_65%)] dark:bg-[radial-gradient(ellipse_at_top,#2a1d4a,transparent_65%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 md:grid-cols-2 md:pt-16">
          <div className="animate-fade-up">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-sm font-bold text-brand-700 shadow-sm ring-1 ring-border dark:text-brand-300">
              🔒 Soukromá tréninková aplikace
            </span>
            <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
              Nanečisto teď. <span className="bg-gradient-to-r from-brand-600 to-analytic-500 bg-clip-text text-transparent">Načisto u zkoušky.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted">
              Testy na čas, rozbor každé chyby s AI lektorem a nekonečný trénink úloh, které ti nejdou.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/login" size="lg">
                Přihlásit se
              </ButtonLink>
              <ButtonLink href="/signup" size="lg" variant="secondary">
                Registrace s kódem
              </ButtonLink>
            </div>
            <p className="mt-4 text-sm text-muted">Registrace je jen na pozvánku – potřebuješ přístupový kód.</p>
          </div>

          <div className="relative mx-auto w-full max-w-md animate-fade-up [animation-delay:150ms]">
            <div className="rounded-3xl border-2 border-border bg-surface p-5 shadow-2xl shadow-brand-900/10">
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="rounded-full bg-verbal-100 px-3 py-1 font-bold text-verbal-700 dark:bg-verbal-700/30 dark:text-violet-200">
                  Ukázka
                </span>
                <span className="font-mono font-bold tabular-nums">12:30</span>
              </div>
              <p className="text-[15px] font-semibold tracking-wide">PEKAŘ : CHLÉB = ______ : ______</p>
              <div className="mt-4 grid gap-2 text-sm">
                {["truhlář – stůl", "kuchař – kuchyně", "zedník – cihla", "malíř – štětec"].map((o, i) => (
                  <div
                    key={o}
                    className={`rounded-2xl border-2 px-3 py-2.5 font-semibold ${i === 0 ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200" : "border-border"}`}
                  >
                    <span className="mr-2 text-muted">{"ABCD"[i]}</span>
                    {o}
                  </div>
                ))}
              </div>
              <div className="rich explain mt-4 rounded-2xl bg-surface-2 p-3 text-sm">
                <mark>Pekař vyrábí chléb</mark> → stejný vztah má jen <strong>truhlář a stůl</strong>.
              </div>
            </div>
            <div className="absolute -right-3 -top-4 rotate-6 rounded-2xl bg-orange-500 px-3 py-2 font-display font-bold text-white shadow-lg">
              🔥 12 dní
            </div>
            <div className="absolute -bottom-4 -left-3 -rotate-6 rounded-2xl bg-brand-600 px-3 py-2 font-display font-bold text-white shadow-lg">
              +15 XP
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="animate-fade-up rounded-3xl border-2 border-border bg-surface p-5"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="text-3xl">{f.emoji}</div>
              <h3 className="mt-2 font-display text-lg font-bold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted">{f.text}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
