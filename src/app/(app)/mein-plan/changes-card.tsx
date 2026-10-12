import { ArrowRight, History } from "lucide-react";
import type { ShiftChange } from "@/lib/planning/changes";
import { fmtDay, minToHHMM, parseDateOnly } from "@/lib/time";

const LABEL = { new: "Neu", changed: "Geändert", removed: "Gestrichen" } as const;

/** „Was hat sich geändert?“ – eigene Änderungen seit der Veröffentlichung */
export function ChangesCard({ changes, publishedAt }: { changes: ShiftChange[]; publishedAt: string | null }) {
  if (changes.length === 0) return null;
  const time = (s: { startMin: number; endMin: number } | null) => (s ? `${minToHHMM(s.startMin)}–${minToHHMM(s.endMin)}` : "");
  return (
    <div className="rounded-2xl border border-warning/50 bg-warning/10 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <History className="size-4" />
        Seit der Veröffentlichung
        {publishedAt && ` am ${new Date(publishedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}`} geändert
      </div>
      <ul className="space-y-1 text-sm">
        {changes.map((c) => (
          <li key={`${c.kind}-${c.shiftId}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="w-24 shrink-0 text-muted-foreground">{fmtDay(parseDateOnly(c.date), "EEE dd.MM.")}</span>
            <span className="rounded bg-background/70 px-1.5 text-xs font-medium">{LABEL[c.kind]}</span>
            {c.kind === "changed" && (
              <span className="flex items-center gap-1.5 tabular-nums">
                <span className="text-muted-foreground line-through">{time(c.before)}</span>
                <ArrowRight className="size-3.5" />
                <span className="font-medium">{time(c.after)}</span>
              </span>
            )}
            {c.kind === "new" && <span className="font-medium tabular-nums">{time(c.after)}</span>}
            {c.kind === "removed" && <span className="text-muted-foreground line-through tabular-nums">{time(c.before)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
