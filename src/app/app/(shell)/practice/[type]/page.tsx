import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PracticeSession } from "@/components/PracticeSession";
import { ProTeaser } from "@/components/Pro";
import { ButtonLink } from "@/components/ui";
import { BASIC } from "@/lib/plans";
import { taskTypeMeta, SECTION_META } from "@/lib/content/exams";
import { getPlan, getProfile, requireUser } from "@/lib/server/auth";
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
  if ((await getPlan(user.id)) === "basic") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/app/practice" className="grid h-10 w-10 place-items-center rounded-xl hover:bg-surface-2" aria-label="Zpět">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="font-display text-2xl font-extrabold">
            {meta.emoji} {meta.name}
          </h1>
        </div>
        <ProTeaser title="Trénink jednoho typu je v Pro">
          {meta.description} V Pro si ho můžeš trénovat zvlášť, kolikrát chceš. V Basic ti tyhle úlohy chodí v Mixu ({BASIC.dailyTasks} denně).
        </ProTeaser>
        <ButtonLink href="/app/practice/mix">🎲 Trénovat Mix</ButtonLink>
      </div>
    );
  }
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
      types={[meta.id]}
      name={meta.name}
      emoji={meta.emoji}
      tone={SECTION_META[meta.section].tone}
      openMistakes={count ?? 0}
      initialLimit={profile.practice_time_limit_sec}
      initialMode={mode}
    />
  );
}
