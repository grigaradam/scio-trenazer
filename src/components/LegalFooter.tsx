import clsx from "clsx";
import Link from "next/link";

export const OPERATOR = {
  name: "Adam Grigar",
  ico: "23007966",
  address: "Tyršova 843, 357 35 Chodov",
  email: "grigar.adam@gmail.com",
};

export const LEGAL_LINKS = [
  { href: "/obchodni-podminky", label: "Obchodní podmínky" },
  { href: "/ochrana-osobnich-udaju", label: "Ochrana osobních údajů" },
  { href: "/cookies", label: "Cookies" },
  { href: "/odstoupeni", label: "Odstoupit od smlouvy" },
] as const;

/** Footer with every legal document and the operator's identification. */
export function LegalFooter({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <footer className={clsx("text-sm text-muted", !compact && "border-t-2 border-border", className)}>
      <div className={clsx("mx-auto max-w-6xl px-4", compact ? "py-0" : "py-6")}>
        <nav aria-label="Právní informace" className={clsx("flex flex-wrap gap-x-4 gap-y-1", compact && "justify-center text-xs")}>
          {LEGAL_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="font-semibold hover:text-text">
              {l.label}
            </Link>
          ))}
          <a href={`mailto:${OPERATOR.email}`} className="font-semibold hover:text-text">
            Kontakt
          </a>
        </nav>
        {!compact && (
          <p className="mt-3 text-xs">
            © {new Date().getFullYear()} {OPERATOR.name}, IČO {OPERATOR.ico}, {OPERATOR.address}, zapsaný v živnostenském rejstříku ·{" "}
            {OPERATOR.email}
          </p>
        )}
      </div>
    </footer>
  );
}
