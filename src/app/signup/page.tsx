import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { AuthShell } from "@/components/AuthShell";

export const metadata = { title: "Registrace" };

export default function SignupPage() {
  return (
    <AuthShell title="Registrace 🔑" subtitle="Registrace je jen na pozvánku – zadej přístupový kód, který jsi dostal(a).">
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </AuthShell>
  );
}
