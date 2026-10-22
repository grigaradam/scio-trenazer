import { FullScreenLoader } from "@/components/PageSkeletons";

// First entry into the app (layout is still loading the profile).
export default function Loading() {
  return <FullScreenLoader title="Načítám…" />;
}
