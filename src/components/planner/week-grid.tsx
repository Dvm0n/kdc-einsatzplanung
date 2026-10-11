"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { moveShift } from "@/app/(app)/plan/actions";
import { workMinutes } from "@/lib/planning/shifts";
import type { ActivityDTO, ShiftDTO } from "@/lib/planning/types";
import type { WeekData } from "@/lib/schedule";
import { fmtDay, minToHHMM, parseDateOnly } from "@/lib/time";
import { ABSENCE_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { DayDemand } from "@/lib/demand";
import { CoverageStrip } from "./coverage-chart";
import { SegmentStrip } from "./shift-bar";

const hrs = (m: number) => (m / 60).toLocaleString("de-DE", { maximumFractionDigits: 1 });

export function WeekGrid({
  data,
  canEdit,
  highlightEmployeeId,
  onEdit,
  onCreate,
  onOpenDay,
  demandByDate,
}: {
  demandByDate?: Record<string, DayDemand>;
  data: WeekData;
  canEdit: boolean;
  highlightEmployeeId?: string | null;
  onEdit?: (shift: ShiftDTO) => void;
  onCreate?: (employeeId: string, date: string) => void;
  onOpenDay?: (date: string) => void;
}) {
  const acts = useMemo(() => Object.fromEntries(data.activities.map((a) => [a.id, a])), [data.activities]) as Record<
    string,
    ActivityDTO
  >;
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const byCell = useMemo(() => {
    const m = new Map<string, ShiftDTO[]>();
    for (const s of data.shifts) {
      const k = `${s.employeeId}|${s.date}`;
      m.set(k, [...(m.get(k) ?? []), s].sort((a, b) => a.startMin - b.startMin));
    }
    return m;
  }, [data.shifts]);

  const warnByEmployee = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of data.warnings) if (w.level !== "info") m.set(w.employeeId, (m.get(w.employeeId) ?? 0) + 1);
    return m;
  }, [data.warnings]);

  const holidayByDate = Object.fromEntries(data.holidays.map((h) => [h.date, h]));
  const today = new Date().toISOString().slice(0, 10);

  function phoneMinutes(date: string) {
    return data.shifts
      .filter((s) => s.date === date)
      .reduce(
        (sum, s) => sum + s.segments.reduce((x, seg) => x + (acts[seg.activityTypeId]?.isPhoneTime ? seg.endMin - seg.startMin : 0), 0),
        0,
      );
  }

  function onDrop(e: React.DragEvent, employeeId: string, date: string) {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/shift-id");
    if (!id) return;
    const copy = e.altKey || e.ctrlKey;
    startTransition(async () => {
      const r = await moveShift(id, employeeId, date, copy);
      if (!r.ok) toast.error(r.error);
      else if (r.message) toast.success(r.message);
    });
  }

  return (
    <div className="overflow-x-auto rounded-2xl border bg-card">
      <div className="grid min-w-[860px] grid-cols-[124px_repeat(7,minmax(0,1fr))] md:min-w-[980px] md:grid-cols-[200px_repeat(7,minmax(0,1fr))]">
        {/* Kopfzeile */}
        <div className="sticky left-0 z-10 border-b bg-card px-3 py-3 text-xs text-muted-foreground md:px-4">Mitarbeiter</div>
        {data.days.map((d) => {
          const hol = holidayByDate[d];
          return (
            <button
              key={d}
              type="button"
              onClick={() => onOpenDay?.(d)}
              className={cn(
                "border-b border-l px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
                d === today && "bg-primary/5",
              )}
            >
              <div className={cn("text-sm font-medium", d === today && "text-primary")}>
                {fmtDay(parseDateOnly(d), "EEEE")}
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{fmtDay(parseDateOnly(d), "dd.MM.")}</span>
                <span title="Geplante Inbound-Stunden">{hrs(phoneMinutes(d))} h</span>
              </div>
              {demandByDate?.[d] && !demandByDate[d].closed && (
                <div className="mt-1.5">
                  <CoverageStrip intervals={demandByDate[d].intervals} />
                </div>
              )}
              {hol && (
                <div className="mt-1 truncate text-[11px] font-medium text-warning" title={hol.name}>
                  {hol.name}
                  {!hol.closed && hol.startMin != null && ` · ${minToHHMM(hol.startMin)}–${minToHHMM(hol.endMin ?? 0)}`}
                </div>
              )}
            </button>
          );
        })}

        {/* Zeilen */}
        {data.employees.map((emp) => {
          const own = data.shifts.filter((s) => s.employeeId === emp.id);
          const planned = own.reduce((s, sh) => s + workMinutes(sh.segments, acts), 0);
          const target = emp.weeklyHours * 60;
          const diff = planned - target;
          const warnCount = warnByEmployee.get(emp.id) ?? 0;
          const highlighted = highlightEmployeeId === emp.id;
          return (
            <div key={emp.id} className="contents">
              <div
                className={cn(
                  "sticky left-0 z-10 flex items-center gap-3 border-b bg-card px-3 py-2.5 md:px-4",
                  highlighted && "bg-primary/5",
                )}
              >
                <span
                  className="hidden size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-medium text-white md:flex"
                  style={{ backgroundColor: emp.color }}
                >
                  {emp.firstName[0]}
                  {emp.lastName[0]}
                </span>
                <div className="min-w-0 leading-tight">
                  <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {emp.firstName} {emp.lastName[0]}.
                    {canEdit && warnCount > 0 && (
                      <span className="size-1.5 rounded-full bg-destructive" title={`${warnCount} Hinweise`} />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    <span
                      className={cn(
                        Math.abs(diff) <= 60 ? "text-foreground" : diff > 0 ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {hrs(planned)}
                    </span>{" "}
                    / {hrs(target)} h
                  </div>
                </div>
              </div>

              {data.days.map((d) => {
                const key = `${emp.id}|${d}`;
                const cellShifts = byCell.get(key) ?? [];
                const absence = data.absences.find((a) => a.employeeId === emp.id && a.startDate <= d && a.endDate >= d);
                const closed = holidayByDate[d]?.closed;
                return (
                  <div
                    key={key}
                    onDragOver={
                      canEdit
                        ? (e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = e.altKey || e.ctrlKey ? "copy" : "move";
                            setDragOver(key);
                          }
                        : undefined
                    }
                    onDragLeave={() => setDragOver((k) => (k === key ? null : k))}
                    onDrop={canEdit ? (e) => onDrop(e, emp.id, d) : undefined}
                    className={cn(
                      "group relative flex min-h-16 flex-col gap-1 border-b border-l p-1.5",
                      d === today && "bg-primary/[0.03]",
                      closed && "bg-muted/60",
                      highlighted && "bg-primary/5",
                      dragOver === key && "bg-primary/10 ring-2 ring-primary/40 ring-inset",
                    )}
                  >
                    {absence && (
                      <div className="rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                        {canEdit || highlighted ? ABSENCE_LABEL[absence.kind] : "Abwesend"}
                      </div>
                    )}
                    {cellShifts.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        draggable={canEdit}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/shift-id", s.id);
                          e.dataTransfer.effectAllowed = "copyMove";
                        }}
                        onClick={() => canEdit && onEdit?.(s)}
                        className={cn(
                          "w-full rounded-lg border bg-background px-2 py-1.5 text-left shadow-xs transition",
                          canEdit ? "cursor-grab hover:border-primary/50 active:cursor-grabbing" : "cursor-default",
                        )}
                      >
                        <div className="mb-1 text-xs font-medium tabular-nums">
                          {minToHHMM(s.startMin)}–{minToHHMM(s.endMin)}
                        </div>
                        <SegmentStrip startMin={s.startMin} endMin={s.endMin} segments={s.segments} activities={acts} />
                      </button>
                    ))}
                    {canEdit && (
                      <button
                        type="button"
                        aria-label="Schicht hinzufügen"
                        onClick={() => onCreate?.(emp.id, d)}
                        className={cn(
                          "flex flex-1 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition hover:bg-muted group-hover:opacity-100 focus-visible:opacity-100",
                          cellShifts.length === 0 && !absence ? "min-h-12" : "min-h-6",
                        )}
                      >
                        <Plus className="size-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
