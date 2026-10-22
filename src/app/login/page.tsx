import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { AuthShell } from "@/components/AuthShell";

export const metadata = { title: "Přihlášení" };

export default function LoginPage() {
  return (
    <AuthShell title="Vítej zpátky 👋" subtitle="Přihlas se a pokračuj tam, kde jsi skončil(a).">
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </AuthShell>
  );
}
