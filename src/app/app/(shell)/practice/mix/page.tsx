import { PracticeSession } from "@/components/PracticeSession";
import { SECTION_META, taskTypeMeta, taskTypesFor } from "@/lib/content/exams";
import type { TaskType } from "@/lib/content/types";
import { BASIC, effectivePlan } from "@/lib/plans";
import { getProfile, requireUser } from "@/lib/server/auth";
import { practiceToday } from "@/lib/server/queries";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Mix" };

export default async function PracticeMixPage({ searchParams }: PageProps<"/app/practice/mix">) {
  const sp = await searchParams;
  const { user } = await requireUser();
  const profile = await getProfile(user.id);
  const basic = effectivePlan(profile) === "basic";
  const all = taskTypesFor("osp");
  // ?types=a,b,c – unknown ids are dropped, nothing valid left = everything
  // Basic always gets everything
  const asked = (typeof sp.types === "string" && !basic ? sp.types.split(",") : []).map(taskTypeMeta).filter((m) => m !== undefined);
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

  const { count } = await createAdminClient()
    .from("mistakes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .in("task_type", types)
    .eq("status", "open");
  const mode = !basic && (sp.mode === "mistakes" || sp.mode === "new") ? sp.mode : "mix";
  const basicLeft = basic ? Math.max(0, BASIC.dailyTasks - (await practiceToday(user.id))) : null;
  return (
    <PracticeSession
      types={types}
      name={name}
      emoji="🎲"
      tone={sections.length === 1 && sections[0] === "verbal" ? "verbal" : "analytic"}
      openMistakes={count ?? 0}
      initialLimit={profile.practice_time_limit_sec}
      initialMode={mode}
      basicLeft={basicLeft}
    />
  );
}
