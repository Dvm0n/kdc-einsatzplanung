"use client";

import { useMemo, useState, useTransition } from "react";
import { Hand, Plus } from "lucide-react";
import { toast } from "sonner";
import { moveShift } from "@/app/(app)/plan/actions";
import type { ShiftChange } from "@/lib/planning/changes";
import { workMinutes } from "@/lib/planning/shifts";
import type { ActivityDTO, ShiftDTO } from "@/lib/planning/types";
import type { WeekData } from "@/lib/schedule";
import { fmtDay, minToHHMM, parseDateOnly } from "@/lib/time";
import { ABSENCE_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { DayDemand } from "@/lib/demand";
import type { OpenShiftDTO } from "@/lib/open-shifts";
import { CoverageStrip } from "./coverage-chart";
import { OpenShiftChip } from "./open-shift-dialogs";
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
  visibleDays,
  onOpenShift,
  onCreateOpenShift,
}: {
  demandByDate?: Record<string, DayDemand>;
  /** angezeigte Tage (geschlossene Tage ggf. ausgeblendet) */
  visibleDays?: string[];
  onOpenShift?: (o: OpenShiftDTO) => void;
  onCreateOpenShift?: (date: string) => void;
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

  // „Was hat sich geändert?“ seit der Veröffentlichung
  const changeById = useMemo(
    () => new Map(data.changes.filter((c) => c.kind !== "removed").map((c) => [c.shiftId, c])),
    [data.changes],
  );
  const removedByCell = useMemo(() => {
    const m = new Map<string, ShiftChange[]>();
    for (const c of data.changes.filter((x) => x.kind === "removed")) {
      const k = `${c.employeeId}|${c.date}`;
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    return m;
  }, [data.changes]);

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

  const days = visibleDays ?? data.days;
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
      <div
        className="grid grid-cols-[124px_repeat(var(--cols),minmax(0,1fr))] md:grid-cols-[200px_repeat(var(--cols),minmax(0,1fr))]"
        style={{ "--cols": days.length, minWidth: 124 + days.length * 105 } as React.CSSProperties}
      >
        {/* Kopfzeile */}
        <div className="sticky left-0 z-10 border-b bg-card px-3 py-3 text-xs text-muted-foreground md:px-4">Mitarbeiter</div>
        {days.map((d) => {
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

        {/* Schichtbörse */}
        {(canEdit || data.openShifts.length > 0) && (
          <div className="contents">
            <div className="sticky left-0 z-10 flex items-center gap-2 border-b bg-primary/[0.04] px-3 py-2.5 md:px-4">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-primary/50 text-primary max-md:hidden">
                <Hand className="size-3.5" />
              </span>
              <div className="leading-tight">
                <div className="text-sm font-medium">Offene Schichten</div>
                <div className="text-xs text-muted-foreground">Schichtbörse</div>
              </div>
            </div>
            {days.map((d) => {
              const list = data.openShifts.filter((o) => o.date === d);
              return (
                <div key={`open-${d}`} className="group flex min-h-12 flex-col gap-1 border-b border-l bg-primary/[0.04] p-1.5">
                  {list.map((o) => (
                    <OpenShiftChip
                      key={o.id}
                      shift={o}
                      activities={acts}
                      onClick={() => onOpenShift?.(o)}
                      highlight={!!highlightEmployeeId && o.bids.some((b) => b.employeeId === highlightEmployeeId)}
                    />
                  ))}
                  {canEdit && (
                    <button
                      type="button"
                      aria-label="Schicht ausschreiben"
                      onClick={() => onCreateOpenShift?.(d)}
                      className="flex min-h-6 flex-1 items-center justify-center rounded-lg text-xs text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-muted focus-visible:opacity-100"
                    >
                      <Plus className="size-3.5" /> ausschreiben
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

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

              {days.map((d) => {
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
                        title={changeTitle(changeById.get(s.id))}
                        className={cn(
                          "relative w-full rounded-lg border bg-background px-2 py-1.5 text-left shadow-xs transition",
                          canEdit ? "cursor-grab hover:border-primary/50 active:cursor-grabbing" : "cursor-default",
                          changeById.has(s.id) && "border-warning/60",
                        )}
                      >
                        <div className="mb-1 text-xs font-medium whitespace-nowrap tabular-nums max-xl:text-[11px]">
                          {minToHHMM(s.startMin)}–{minToHHMM(s.endMin)}
                        </div>
                        <SegmentStrip startMin={s.startMin} endMin={s.endMin} segments={s.segments} activities={acts} />
                        {changeById.has(s.id) && (
                          <span className="absolute -top-1.5 right-1 rounded bg-warning px-1 text-[9px] leading-3.5 font-semibold text-black/75">
                            {changeById.get(s.id)!.kind === "new" ? "neu" : "geändert"}
                          </span>
                        )}
                      </button>
                    ))}
                    {(removedByCell.get(key) ?? []).map((c) => (
                      <div
                        key={`removed-${c.shiftId}`}
                        title={`Gestrichen seit Veröffentlichung (vorher ${minToHHMM(c.before!.startMin)}–${minToHHMM(c.before!.endMin)})`}
                        className="rounded-lg border border-dashed px-2 py-1 text-[11px] text-muted-foreground line-through tabular-nums"
                      >
                        {minToHHMM(c.before!.startMin)}–{minToHHMM(c.before!.endMin)}
                      </div>
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

function changeTitle(c: ShiftChange | undefined) {
  if (!c) return undefined;
  if (c.kind === "new") return "Neu seit Veröffentlichung";
  return `Geändert seit Veröffentlichung – vorher ${minToHHMM(c.before!.startMin)}–${minToHHMM(c.before!.endMin)}`;
}
