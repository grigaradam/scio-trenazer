import { MistakesView } from "@/components/MistakesView";
import { stripGroup } from "@/lib/content/public";
import { requireUser } from "@/lib/server/auth";
import { getMistakes } from "@/lib/server/queries";
import { resolveTask } from "@/lib/server/tasks";

export const metadata = { title: "Slabiny" };

export default async function MistakesPage() {
  const { user } = await requireUser();
  const mistakes = await getMistakes(user.id);
  const open = mistakes.filter((m) => m.status === "open").slice(0, 80);
  const resolved = await Promise.all(
    open.map(async (m) => {
      const t = await resolveTask(m.task_ref);
      if (!t) return null;
      return {
        ref: t.ref,
        type: t.taskType,
        tries: m.tries,
        source: m.source,
        origin: t.origin.kind === "test" ? `${t.origin.testTitle.replace("OSP – ", "")} · úloha ${t.origin.n}` : "AI trénink",
        group: stripGroup(t.group),
        updatedAt: m.updated_at,
      };
    }),
  );
  return (
    <MistakesView
      items={resolved.filter((x) => x !== null)}
      fixedCount={mistakes.filter((m) => m.status === "fixed").length}
      totalOpen={mistakes.filter((m) => m.status === "open").length}
    />
  );
}
