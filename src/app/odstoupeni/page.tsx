import { notFound } from "next/navigation";
import { LegalPage } from "@/components/LegalPage";
import { WithdrawalForm } from "@/components/WithdrawalForm";
import { readLegal } from "@/lib/legal";

export const metadata = { title: "Odstoupení od smlouvy" };

export default function WithdrawalPage() {
  const doc = readLegal("odstoupeni");
  if (!doc) notFound();
  return <LegalPage doc={doc} before={<WithdrawalForm />} />;
}
