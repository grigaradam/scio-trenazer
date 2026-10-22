import { notFound } from "next/navigation";
import { PracticeSession } from "@/components/PracticeSession";
import { taskTypeMeta } from "@/lib/content/exams";
import { getProfile, requireUser } from "@/lib/server/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function generateMetadata({ params }: PageProps<"/app/practice/[type]">) {
  const { type } = await params;
  return { title: taskTypeMeta(type)?.name ?? "Trénink" };
}

export default async function PracticeTypePage({ params, searchParams }: PageProps<"/app/practice/[type]">) {
  const { type } = await params;
  const sp = await searchParams;
  const meta = taskTypeMeta(type);
  if (!meta) notFound();
  const { user } = await requireUser();
  const profile = await getProfile(user.id);
  const { count } = await createAdminClient()
    .from("mistakes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("task_type", type)
    .eq("status", "open");
  const mode = sp.mode === "mistakes" || sp.mode === "new" ? sp.mode : "mix";
  return (
    <PracticeSession
      type={meta.id}
      name={meta.name}
      emoji={meta.emoji}
      tone={meta.section === "verbal" ? "verbal" : "analytic"}
      openMistakes={count ?? 0}
      initialLimit={profile.practice_time_limit_sec}
      initialMode={mode}
    />
  );
}
