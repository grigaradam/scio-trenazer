import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthShell } from "@/components/AuthShell";
import { ReactivateForm } from "@/components/ReactivateForm";
import { getProfile, requireUser } from "@/lib/server/auth";

export const metadata = { title: "Obnovit přístup" };

export default async function ReactivatePage() {
  const { user } = await requireUser({ allowBlocked: true });
  const profile = await getProfile(user.id);
  if (!profile.blocked) redirect("/app");
  return (
    <AuthShell title="Platnost vypršela ⏳" subtitle="Vaše platnost vypršela, musíte zadat nový přístupový kód. Tvůj pokrok, XP i chyby zůstávají uložené.">
      <Suspense>
        <ReactivateForm />
      </Suspense>
    </AuthShell>
  );
}
