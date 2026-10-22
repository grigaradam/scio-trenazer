import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { AuthShell } from "@/components/AuthShell";

export const metadata = { title: "Registrace" };

export default function SignupPage() {
  return (
    <AuthShell title="Začni trénovat 🚀" subtitle="Účet je zdarma. Ukládáme ti pokrok, chyby i streak.">
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </AuthShell>
  );
}
