import { Skeleton } from "@/components/ui/skeleton";

export default function PlanLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Plan wird geladen">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-36 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-36" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-36 rounded-lg" />
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="grid grid-cols-[200px_repeat(7,minmax(0,1fr))] border-b">
          <div className="p-3" />
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="space-y-1.5 border-l p-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
        {Array.from({ length: 8 }, (_, r) => (
          <div key={r} className="grid grid-cols-[200px_repeat(7,minmax(0,1fr))] border-b last:border-b-0">
            <div className="flex items-center gap-3 p-3">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-4 w-24" />
            </div>
            {Array.from({ length: 7 }, (_, c) => (
              <div key={c} className="border-l p-1.5">
                {(r + c) % 3 !== 2 && c < 5 && <Skeleton className="h-11 rounded-lg" />}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
