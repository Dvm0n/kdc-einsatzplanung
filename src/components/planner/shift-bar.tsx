import type { ActivityDTO, SegmentDTO } from "@/lib/planning/types";

/** Kleine proportionale Leiste der Segmente einer Schicht */
export function SegmentStrip({
  startMin,
  endMin,
  segments,
  activities,
  className = "h-1.5",
}: {
  startMin: number;
  endMin: number;
  segments: SegmentDTO[];
  activities: Record<string, ActivityDTO>;
  className?: string;
}) {
  const total = endMin - startMin || 1;
  return (
    <div className={`flex w-full overflow-hidden rounded-full bg-muted ${className}`}>
      {segments.map((s, i) => (
        <div
          key={i}
          title={activities[s.activityTypeId]?.name}
          style={{
            width: `${((s.endMin - s.startMin) / total) * 100}%`,
            backgroundColor: activities[s.activityTypeId]?.color,
            opacity: activities[s.activityTypeId]?.isBreak ? 0.45 : 1,
          }}
        />
      ))}
    </div>
  );
}

export function ActivityLegend({ activities }: { activities: ActivityDTO[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {activities.map((a) => (
        <span key={a.id} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ backgroundColor: a.color, opacity: a.isBreak ? 0.45 : 1 }} />
          {a.name}
        </span>
      ))}
    </div>
  );
}
