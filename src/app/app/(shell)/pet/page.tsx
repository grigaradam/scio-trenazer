import { PetView } from "@/components/PetView";
import { getProfile, requireUser } from "@/lib/server/auth";
import { getPetInput } from "@/lib/server/pet";

export const metadata = { title: "Mazlíček" };

export default async function PetPage() {
  const { user } = await requireUser();
  const profile = await getProfile(user.id);
  const { input, achievements } = await getPetInput(user.id, profile);

  return (
    <PetView
      userId={user.id}
      xp={profile.xp}
      input={input}
      unlocked={achievements.map((a) => a.code)}
      override={profile.test_override?.pet ?? null}
    />
  );
}
