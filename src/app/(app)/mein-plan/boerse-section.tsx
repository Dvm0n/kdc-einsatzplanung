"use client";

import { useState } from "react";
import { Hand } from "lucide-react";
import { OpenShiftDialog } from "@/components/planner/open-shift-dialogs";
import { SegmentStrip } from "@/components/planner/shift-bar";
import { Badge } from "@/components/ui/badge";
import type { OpenShiftDTO } from "@/lib/open-shifts";
import type { ActivityDTO } from "@/lib/planning/types";
import { fmtDay, minToHHMM, parseDateOnly } from "@/lib/time";
import { cn } from "@/lib/utils";

/** Schichtbörse für Operator: offene Schichten ansehen, sich melden, eigene Angebote verwalten */
export function BoerseSection({
  shifts,
  activities,
  myEmployeeId,
  conflicts,
}: {
  shifts: OpenShiftDTO[];
  activities: ActivityDTO[];
  myEmployeeId: string;
  /** offene Schicht-ID → Grund, warum ich sie nicht übernehmen kann */
  conflicts: Record<string, string>;
}) {
  const [view, setView] = useState<OpenShiftDTO | null>(null);
  const acts = Object.fromEntries(activities.map((a) => [a.id, a]));

  return (
    <section id="boerse" className="scroll-mt-20 rounded-2xl border bg-card">
      <div className="flex items-center gap-2 border-b px-5 py-4">
        <Hand className="size-4 text-primary" />
        <h2 className="font-medium">Schichtbörse</h2>
        <span className="text-sm text-muted-foreground">· offene Schichten zum Übernehmen</span>
      </div>
      {shifts.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">
          Gerade gibt es keine offenen Schichten. Eigene Schichten kannst du über „Ändern → An alle abgeben“ anbieten.
        </p>
      ) : (
        <div className="divide-y">
          {shifts.map((o) => {
            const mine = o.offeredBy?.id === myEmployeeId;
            const iBid = o.bids.some((b) => b.employeeId === myEmployeeId);
            const conflict = conflicts[o.id];
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setView(o)}
                className={cn("flex w-full items-center gap-4 px-5 py-3 text-left transition hover:bg-muted/50", conflict && !mine && "opacity-60")}
              >
                <div className="w-20 shrink-0 leading-tight">
                  <div className="text-sm font-medium">{fmtDay(parseDateOnly(o.date), "EEE dd.MM.")}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {minToHHMM(o.startMin)}–{minToHHMM(o.endMin)}
                  </div>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <SegmentStrip startMin={o.startMin} endMin={o.endMin} segments={o.segments} activities={acts} />
                  <div className="truncate text-xs text-muted-foreground">
                    {mine ? "Dein Angebot" : o.offeredBy ? `von ${o.offeredBy.name}` : "von der Planung ausgeschrieben"}
                    {o.note && ` · „${o.note}“`}
                  </div>
                </div>
                {mine ? (
                  <Badge variant="outline">{o.bids.length} Meldung(en)</Badge>
                ) : iBid ? (
                  <Badge className="bg-primary/15 text-primary">Gemeldet</Badge>
                ) : conflict ? (
                  <span className="text-xs text-muted-foreground">nicht möglich</span>
                ) : (
                  <Badge variant="secondary">Übernehmen?</Badge>
                )}
              </button>
            );
          })}
        </div>
      )}
      <OpenShiftDialog
        shift={view}
        onClose={() => setView(null)}
        activities={activities}
        planner={false}
        myEmployeeId={myEmployeeId}
        conflicts={view && conflicts[view.id] ? { [myEmployeeId]: conflicts[view.id] } : undefined}
      />
    </section>
  );
}
