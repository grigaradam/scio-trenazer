import { TaskSkeleton } from "@/components/PageSkeletons";
import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="space-y-4" aria-busy>
      <Skeleton className="h-10 w-72 max-w-full" />
      <Skeleton className="h-9 w-80 max-w-full" />
      <TaskSkeleton />
    </div>
  );
}
