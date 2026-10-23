import { PracticeSession } from "@/components/PracticeSession";
import { SECTION_META, taskTypeMeta, taskTypesFor } from "@/lib/content/exams";
import type { TaskType } from "@/lib/content/types";
import { getProfile, requireUser } from "@/lib/server/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Mix" };

export default async function PracticeMixPage({ searchParams }: PageProps<"/app/practice/mix">) {
  const sp = await searchParams;
  const all = taskTypesFor("osp");
  // ?types=a,b,c – unknown ids are dropped, nothing valid left = everything
  const asked = (typeof sp.types === "string" ? sp.types.split(",") : []).map(taskTypeMeta).filter((m) => m !== undefined);
  const picked = asked.length ? all.filter((t) => asked.includes(t)) : all;
  const types = picked.map((t) => t.id as TaskType);

  const sections = [...new Set(picked.map((t) => t.section))];
  const whole = sections.filter((s) => taskTypesFor("osp", s).every((t) => picked.includes(t)));
  const name =
    picked.length === all.length
      ? "Mix – všechno"
      : whole.length === sections.length && sections.length === 1
        ? `Mix – ${SECTION_META[sections[0]].short.toLowerCase()} oddíl`
        : "Mix – vlastní výběr";

  const { user } = await requireUser();
  const profile = await getProfile(user.id);
  const { count } = await createAdminClient()
    .from("mistakes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .in("task_type", types)
    .eq("status", "open");
  const mode = sp.mode === "mistakes" || sp.mode === "new" ? sp.mode : "mix";
  return (
    <PracticeSession
      types={types}
      name={name}
      emoji="🎲"
      tone={sections.length === 1 && sections[0] === "verbal" ? "verbal" : "analytic"}
      openMistakes={count ?? 0}
      initialLimit={profile.practice_time_limit_sec}
      initialMode={mode}
    />
  );
}
