import { redirect } from "next/navigation";
import { Onboarding } from "@/components/Onboarding";
import { getProfile, requireUser } from "@/lib/server/auth";

export const metadata = { title: "Vítej" };

export default async function OnboardingPage() {
  const { user } = await requireUser();
  const profile = await getProfile(user.id);
  if (profile.onboarded) redirect("/app");
  return <Onboarding name={profile.display_name ?? ""} />;
}
