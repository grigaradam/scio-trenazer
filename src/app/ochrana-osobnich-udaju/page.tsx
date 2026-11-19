import { notFound } from "next/navigation";
import { LegalPage } from "@/components/LegalPage";
import { readLegal } from "@/lib/legal";

export const metadata = { title: "Ochrana osobních údajů" };

export default function PrivacyPage() {
  const doc = readLegal("ochrana-osobnich-udaju");
  if (!doc) notFound();
  return <LegalPage doc={doc} />;
}
