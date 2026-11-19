import Link from "next/link";
import { notFound } from "next/navigation";
import { LegalPage } from "@/components/LegalPage";
import { legalArchive, readLegal } from "@/lib/legal";

export const metadata = { title: "Obchodní podmínky" };

export default function TermsPage() {
  const doc = readLegal("obchodni-podminky");
  if (!doc) notFound();
  const archive = legalArchive();
  return (
    <LegalPage
      doc={doc}
      after={
        <section id="archiv" className="mt-12 scroll-mt-20 rounded-3xl border-2 border-border bg-surface p-5">
          <h2 className="font-display text-xl font-extrabold">Archiv znění</h2>
          <p className="mt-1 text-sm text-muted">Všechna zveřejněná znění dokumentů. Pro každou smlouvu platí znění účinné v den jejího uzavření.</p>
          <ul className="mt-3 space-y-2 text-sm">
            {archive.map((d) => (
              <li key={d.slug}>
                <span className="font-bold">{d.title}:</span>{" "}
                {d.versions.map((v, i) => (
                  <span key={v.version}>
                    {i > 0 && " · "}
                    <Link href={`/archiv/${d.slug}/${v.version}`} className="font-semibold text-brand-600 underline underline-offset-2 dark:text-brand-300">
                      {v.meta || `verze ${v.version}`}
                    </Link>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </section>
      }
    />
  );
}
