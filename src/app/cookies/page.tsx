import { notFound } from "next/navigation";
import { LegalPage } from "@/components/LegalPage";
import { readLegal } from "@/lib/legal";

export const metadata = { title: "Cookies" };

export default function CookiesPage() {
  const doc = readLegal("cookies");
  if (!doc) notFound();
  return <LegalPage doc={doc} />;
}
