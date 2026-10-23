import { redirect } from "next/navigation";
import { Onboarding } from "@/components/Onboarding";
import { getProfile, requireUser } from "@/lib/server/auth";
import { greetingName } from "@/lib/server/names";

export const metadata = { title: "Vítej" };

export default async function OnboardingPage() {
  const { user } = await requireUser();
  const profile = await getProfile(user.id);
  if (profile.onboarded) redirect("/app");
  return <Onboarding name={greetingName(profile) ?? ""} />;
}
