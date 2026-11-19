import { notFound } from "next/navigation";
import { LegalPage } from "@/components/LegalPage";
import { isLegalSlug, legalArchive, readLegal } from "@/lib/legal";

// Fixed wording of a past (or the current) version – the address purchase confirmations link to.
export const dynamicParams = false;

export function generateStaticParams() {
  return legalArchive().flatMap((d) => d.versions.map((v) => ({ doc: d.slug, verze: v.version })));
}

export async function generateMetadata({ params }: PageProps<"/archiv/[doc]/[verze]">) {
  const { doc, verze } = await params;
  const d = isLegalSlug(doc) ? readLegal(doc, verze) : null;
  return { title: d ? `${d.title} (verze ${verze})` : "Archiv" };
}

export default async function ArchivedLegalPage({ params }: PageProps<"/archiv/[doc]/[verze]">) {
  const { doc, verze } = await params;
  const d = isLegalSlug(doc) ? readLegal(doc, verze) : null;
  if (!d) notFound();
  return (
    <LegalPage
      doc={d}
      before={
        <p className="mt-3 rounded-2xl bg-surface-2 px-4 py-3 text-sm">
          Archivní znění {verze}. Aktuální znění najdeš v patičce webu.
        </p>
      }
    />
  );
}
