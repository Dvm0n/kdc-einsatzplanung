"use client";

import { useState } from "react";
import { Hand } from "lucide-react";
import { OpenShiftDialog } from "@/components/planner/open-shift-dialogs";
import { SegmentStrip } from "@/components/planner/shift-bar";
import { Badge } from "@/components/ui/badge";
import type { OpenShiftDTO } from "@/lib/open-shifts";
import type { ActivityDTO, EmployeeDTO } from "@/lib/planning/types";
import { fmtDay, minToHHMM, parseDateOnly } from "@/lib/time";

/** Schichtbörse im Posteingang der Planung */
export function BoerseInbox({
  shifts,
  activities,
  employees,
  conflicts,
}: {
  shifts: OpenShiftDTO[];
  activities: ActivityDTO[];
  employees: EmployeeDTO[];
  /** offene Schicht-ID → (Mitarbeiter-ID → Grund) */
  conflicts: Record<string, Record<string, string>>;
}) {
  const [view, setView] = useState<OpenShiftDTO | null>(null);
  const acts = Object.fromEntries(activities.map((a) => [a.id, a]));
  if (shifts.length === 0) return null;

  return (
    <section className="mb-6 rounded-2xl border bg-card">
      <div className="flex items-center gap-2 border-b px-5 py-4">
        <Hand className="size-4 text-primary" />
        <h2 className="font-medium">Schichtbörse</h2>
        <span className="text-sm text-muted-foreground">· {shifts.length} offen</span>
      </div>
      <div className="divide-y">
        {shifts.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setView(o)}
            className="flex w-full items-center gap-4 px-5 py-3 text-left transition hover:bg-muted/50"
          >
            <div className="w-24 shrink-0 leading-tight">
              <div className="text-sm font-medium">{fmtDay(parseDateOnly(o.date), "EEE dd.MM.")}</div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {minToHHMM(o.startMin)}–{minToHHMM(o.endMin)}
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <SegmentStrip startMin={o.startMin} endMin={o.endMin} segments={o.segments} activities={acts} />
              <div className="truncate text-xs text-muted-foreground">
                {o.offeredBy ? `abgegeben von ${o.offeredBy.name}` : "ausgeschrieben"}
                {o.bids.length > 0 && ` · gemeldet: ${o.bids.map((b) => b.name.split(" ")[0]).join(", ")}`}
              </div>
            </div>
            {o.bids.length > 0 ? (
              <Badge className="bg-primary text-primary-foreground">{o.bids.length} Meldung(en)</Badge>
            ) : (
              <Badge variant="outline">keine Meldung</Badge>
            )}
          </button>
        ))}
      </div>
      <OpenShiftDialog
        shift={view}
        onClose={() => setView(null)}
        activities={activities}
        employees={employees}
        planner
        conflicts={view ? conflicts[view.id] : undefined}
      />
    </section>
  );
}
