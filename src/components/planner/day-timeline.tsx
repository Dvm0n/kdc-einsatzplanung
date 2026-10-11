"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, Info, PhoneOutgoing } from "lucide-react";
import { toast } from "sonner";
import { saveShift, saveShiftShapes } from "@/app/(app)/plan/actions";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { DayDemand } from "@/lib/demand";
import { plannedAgents, summarizeCoverage } from "@/lib/planning/coverage";
import { serviceLevel, trafficIntensity } from "@/lib/planning/erlang";
import { suggestOutbound } from "@/lib/planning/overcoverage";
import {
  applyDrag,
  hitTest,
  overlaySegment,
  removeSegment,
  snap,
  type DragHandle,
  type ShiftShape,
} from "@/lib/planning/resize";
import { validateWeek, type PlanWarning } from "@/lib/planning/rules";
import { workMinutes } from "@/lib/planning/shifts";
import type { ActivityDTO, SegmentDTO, ShiftDTO } from "@/lib/planning/types";
import type { WeekData } from "@/lib/schedule";
import { fmtDay, isoWeekday, minToHHMM, parseDateOnly } from "@/lib/time";
import { cn } from "@/lib/utils";
import { CoveragePanel } from "./coverage-panel";
import { OvercoverageDialog } from "./overcoverage-dialog";

const hrs = (m: number) => (m / 60).toLocaleString("de-DE", { maximumFractionDigits: 2 });
/** Mindestbewegung in Pixeln, ab der aus einem Klick ein Ziehen wird */
const DRAG_THRESHOLD = 4;

type Drag = {
  shift: ShiftDTO;
  handle: DragHandle;
  x0: number;
  laneWidth: number;
  moved: boolean;
};

type MenuCtx = {
  employeeId: string;
  minute: number;
  shift: ShiftDTO | null;
  segmentIndex: number | null;
};

const CURSOR: Record<DragHandle["kind"], string> = {
  start: "ew-resize",
  end: "ew-resize",
  boundary: "col-resize",
  move: "grab",
  shift: "grab",
};

export function DayTimeline({
  data,
  date,
  canEdit,
  highlightEmployeeId,
  onEdit,
  onCreate,
  demand,
}: {
  data: WeekData;
  date: string;
  canEdit: boolean;
  highlightEmployeeId?: string | null;
  onEdit?: (s: ShiftDTO) => void;
  onCreate?: (employeeId: string, date: string) => void;
  demand?: DayDemand;
}) {
  const acts = useMemo(() => Object.fromEntries(data.activities.map((a) => [a.id, a])), [data.activities]) as Record<
    string,
    ActivityDTO
  >;
  const inboundId = (data.activities.find((a) => a.key === "INBOUND") ?? data.activities.find((a) => a.isPhoneTime))?.id;
  const outboundId = data.activities.find((a) => a.key === "OUTBOUND")?.id;

  // Lokale Änderungen (während des Ziehens und bis der Server die neue Version liefert)
  const [overrides, setOverrides] = useState<Record<string, ShiftShape>>({});
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuCtx | null>(null);
  const [overOpen, setOverOpen] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => setOverrides({}), [data.shifts]);

  const shifts = useMemo(
    () => data.shifts.map((s) => (overrides[s.id] ? { ...s, ...overrides[s.id] } : s)),
    [data.shifts, overrides],
  );
  const dayShifts = useMemo(() => shifts.filter((s) => s.date === date), [shifts, date]);
  const windows = data.serviceHours.filter((w) => w.weekday === isoWeekday(parseDateOnly(date)));

  // Zeitachse – feste Grenzen aus Call-Zeiten und gespeicherten Schichten (springt beim Ziehen nicht)
  const serverDay = data.shifts.filter((s) => s.date === date);
  const minStart = Math.min(...windows.map((w) => w.startMin), ...serverDay.map((s) => s.startMin), 8 * 60);
  const maxEnd = Math.max(...windows.map((w) => w.endMin), ...serverDay.map((s) => s.endMin), 17 * 60);
  const from = Math.max(0, Math.floor(minStart / 60) * 60 - 60);
  const to = Math.min(1440, Math.ceil(maxEnd / 60) * 60 + 60);
  const span = to - from;
  const pct = (m: number) => `${((m - from) / span) * 100}%`;
  const width = (a: number, b: number) => `${((b - a) / span) * 100}%`;
  const hours = Array.from({ length: span / 60 + 1 }, (_, i) => from + i * 60);

  // Live-Regelprüfung auf Basis der aktuellen (ggf. gezogenen) Schichten
  const warnings: PlanWarning[] = useMemo(() => {
    if (!data.rules) return data.warnings;
    return validateWeek({
      shifts,
      employees: data.employees,
      activities: data.activities,
      absences: data.absences,
      serviceHours: data.serviceHours,
      ...data.rules,
    });
  }, [shifts, data]);

  // Live-Abdeckung
  const liveDemand: DayDemand | undefined = useMemo(() => {
    if (!demand) return undefined;
    const intervals = demand.intervals.map((i) => {
      const planned = plannedAgents(dayShifts, acts, i.startMin, i.endMin);
      const traffic = trafficIntensity(i.calls, i.ahtSeconds, (i.endMin - i.startMin) * 60);
      return {
        ...i,
        planned,
        expectedSL: i.calls > 0 ? serviceLevel(Math.floor(planned + 1e-9), traffic, i.ahtSeconds, data.settings.serviceLevelSeconds) : null,
      };
    });
    return { ...demand, intervals, summary: summarizeCoverage(intervals) };
  }, [demand, dayShifts, acts, data.settings.serviceLevelSeconds]);

  const suggestions = useMemo(
    () =>
      canEdit && liveDemand && inboundId && outboundId
        ? suggestOutbound({ shifts: dayShifts, employees: data.employees, intervals: liveDemand.intervals, inboundId })
        : [],
    [canEdit, liveDemand, inboundId, outboundId, dayShifts, data.employees],
  );
  const surplusHours = suggestions.reduce((s, x) => s + (x.endMin - x.startMin) / 60, 0);

  const rows = data.employees.filter(
    (e) =>
      dayShifts.some((s) => s.employeeId === e.id) ||
      (canEdit && !data.absences.some((a) => a.employeeId === e.id && a.startDate <= date && a.endDate >= date)),
  );

  /* ---------- Ziehen ---------- */

  function shapeOf(s: ShiftDTO): ShiftShape {
    return { startMin: s.startMin, endMin: s.endMin, segments: s.segments };
  }

  function beginDrag(e: React.PointerEvent<HTMLElement>, shift: ShiftDTO) {
    if (e.button !== 0) return; // Rechtsklick → Kontextmenü
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const lane = e.currentTarget.closest("[data-lane]") as HTMLElement | null;
    if (!lane) return;
    const handle = hitTest(shapeOf(shift), e.clientX - rect.left, rect.width);
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { shift, handle, x0: e.clientX, laneWidth: lane.getBoundingClientRect().width, moved: false };
  }

  function onPointerMove(e: React.PointerEvent<HTMLElement>, shift: ShiftDTO) {
    const d = drag.current;
    if (!d) {
      // Hover: Cursor zeigt an, was beim Ziehen passiert
      if (canEdit) {
        const rect = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.cursor = CURSOR[hitTest(shapeOf(shift), e.clientX - rect.left, rect.width).kind];
      }
      return;
    }
    if (!canEdit) return;
    const dx = e.clientX - d.x0;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(d.shift.id);
    }
    const delta = snap((dx / d.laneWidth) * span);
    setOverrides((o) => ({ ...o, [d.shift.id]: applyDrag(shapeOf(d.shift), d.handle, delta, { min: from, max: to }) }));
  }

  function endDrag() {
    const d = drag.current;
    drag.current = null;
    setDragging(null);
    if (!d) return;
    if (!d.moved) {
      // Details nur bei Klick in die Mitte – nie beim Greifen von Rand oder Grenze
      if (canEdit && (d.handle.kind === "shift" || d.handle.kind === "move")) onEdit?.(d.shift);
      return;
    }
    const shape = overrides[d.shift.id];
    if (!shape || sameShape(shape, shapeOf(d.shift))) return;
    persist([{ shift: d.shift, shape }]);
  }

  function persist(items: { shift: ShiftDTO; shape: ShiftShape }[], message?: string) {
    setOverrides((o) => ({ ...o, ...Object.fromEntries(items.map((i) => [i.shift.id, i.shape])) }));
    startTransition(async () => {
      const r = await saveShiftShapes(
        items.map(({ shift, shape }) => ({ id: shift.id, ...shape })),
        message,
      );
      if (!r.ok) {
        toast.error(r.error);
        setOverrides((o) => {
          const next = { ...o };
          for (const i of items) delete next[i.shift.id];
          return next;
        });
      } else if (message) toast.success(r.message);
    });
  }

  /* ---------- Kontextmenü ---------- */

  function openMenu(e: React.MouseEvent<HTMLElement>, employeeId: string) {
    const rect = e.currentTarget.getBoundingClientRect();
    const minute = Math.min(Math.max(snap(from + ((e.clientX - rect.left) / rect.width) * span, 15), from), to - 15);
    const shift = dayShifts.find((s) => s.employeeId === employeeId && s.startMin <= minute && s.endMin > minute) ?? null;
    const segmentIndex = shift ? shift.segments.findIndex((s) => s.startMin <= minute && s.endMin > minute) : null;
    setMenu({ employeeId, minute, shift, segmentIndex });
  }

  function addBlock(ctx: MenuCtx, activityId: string) {
    const len = acts[activityId]?.isBreak ? 30 : 60;
    const own = dayShifts.filter((s) => s.employeeId === ctx.employeeId).sort((a, b) => a.startMin - b.startMin);
    let start = ctx.minute;
    let end = Math.min(start + len, 1440);

    if (ctx.shift) {
      // innerhalb einer Schicht: Block einfügen, ggf. Schicht nach hinten verlängern (bis zur nächsten Schicht)
      const next = own.find((s) => s.startMin >= ctx.shift!.endMin);
      end = Math.min(end, next ? next.startMin : 1440);
      const shape: ShiftShape = {
        startMin: ctx.shift.startMin,
        endMin: Math.max(ctx.shift.endMin, end),
        segments: overlaySegment(extendTo(ctx.shift.segments, end), start, end, activityId),
      };
      persist([{ shift: ctx.shift, shape }], `${acts[activityId]?.name} ${minToHHMM(start)}–${minToHHMM(end)} eingetragen`);
      return;
    }

    // außerhalb: an Nachbarschichten anschließen oder neue Schicht anlegen
    const prev = [...own].reverse().find((s) => s.endMin <= start);
    const next = own.find((s) => s.startMin >= start);
    if (next) end = Math.min(end, next.startMin);
    if (prev) start = Math.max(start, prev.endMin);
    if (end - start < 15) {
      toast.error("Hier ist kein Platz für einen Block");
      return;
    }
    const block: SegmentDTO = { activityTypeId: activityId, startMin: start, endMin: end };
    const label = `${acts[activityId]?.name} ${minToHHMM(start)}–${minToHHMM(end)} eingetragen`;
    if (prev && prev.endMin === start) {
      persist([{ shift: prev, shape: { startMin: prev.startMin, endMin: end, segments: [...prev.segments, block] } }], label);
    } else if (next && next.startMin === end) {
      persist([{ shift: next, shape: { startMin: start, endMin: next.endMin, segments: [block, ...next.segments] } }], label);
    } else {
      startTransition(async () => {
        const r = await saveShift({
          employeeId: ctx.employeeId,
          date,
          startMin: start,
          endMin: end,
          activityTypeId: activityId,
          autoBreak: false,
          segments: [block],
        });
        if (!r.ok) toast.error(r.error);
        else toast.success(label);
      });
    }
  }

  function changeSegment(ctx: MenuCtx, activityId: string) {
    if (!ctx.shift || ctx.segmentIndex == null) return;
    const seg = ctx.shift.segments[ctx.segmentIndex];
    persist(
      [{ shift: ctx.shift, shape: { ...shapeOf(ctx.shift), segments: overlaySegment(ctx.shift.segments, seg.startMin, seg.endMin, activityId) } }],
      `In ${acts[activityId]?.name} umgewandelt`,
    );
  }

  function deleteSegment(ctx: MenuCtx) {
    if (!ctx.shift || ctx.segmentIndex == null) return;
    const shape = removeSegment(shapeOf(ctx.shift), ctx.segmentIndex);
    if (!shape) {
      toast.error("Der letzte Block einer Schicht lässt sich nicht entfernen – bitte die Schicht löschen.");
      return;
    }
    persist([{ shift: ctx.shift, shape }], "Block entfernt");
  }

  const iv = demand?.intervals[0] ? demand.intervals[0].endMin - demand.intervals[0].startMin : 30;
  const menuSeg = menu?.shift && menu.segmentIndex != null ? menu.shift.segments[menu.segmentIndex] : null;
  const menuEmp = menu ? data.employees.find((e) => e.id === menu.employeeId) : null;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <div className="min-w-[760px]">
            {/* Zeitachse */}
            <div className="grid grid-cols-[200px_1fr] border-b">
              <div className="px-4 py-2 text-xs text-muted-foreground">Mitarbeiter</div>
              <div className="relative h-8">
                {hours.map((h) => (
                  <span
                    key={h}
                    className="absolute top-2 -translate-x-1/2 text-[11px] text-muted-foreground tabular-nums"
                    style={{ left: pct(h) }}
                  >
                    {minToHHMM(h).slice(0, 2)}
                  </span>
                ))}
              </div>
            </div>

            {/* Live-Abdeckung je Intervall */}
            {liveDemand && !liveDemand.closed && (
              <div className="grid grid-cols-[200px_1fr] border-b bg-muted/20">
                <div className="flex flex-col justify-center gap-0.5 px-4 py-1.5 text-xs">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Abdeckung</span>
                    {liveDemand.summary.underCount > 0 ? (
                      <span className="font-medium text-destructive">{liveDemand.summary.underCount}× zu wenig</span>
                    ) : (
                      <span className="font-medium text-success">gedeckt</span>
                    )}
                  </div>
                  {canEdit && surplusHours > 0 && outboundId && (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="-ml-2 h-6 justify-start text-primary"
                      onClick={() => setOverOpen(true)}
                    >
                      <PhoneOutgoing /> {hrs(surplusHours * 60)} h Überdeckung → Outbound
                    </Button>
                  )}
                </div>
                <div className="relative h-auto min-h-7">
                  {liveDemand.intervals.map((i) => {
                    const gap = i.required - i.planned;
                    const surplus = Math.floor(-gap + 1e-9);
                    return (
                      <Tooltip key={i.startMin}>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              "absolute top-1.5 bottom-1.5 flex items-center justify-center rounded-sm text-[10px] font-medium tabular-nums",
                              gap >= 1
                                ? "bg-destructive text-white"
                                : gap > 1e-9
                                  ? "bg-warning text-black/70"
                                  : surplus >= 1
                                    ? "bg-primary/15 text-primary"
                                    : "bg-success/25 text-success",
                            )}
                            style={{ left: `calc(${pct(i.startMin)} + 1px)`, width: `calc(${width(i.startMin, i.startMin + iv)} - 2px)` }}
                          >
                            {gap > 1e-9 ? `−${Math.ceil(gap - 1e-9)}` : surplus >= 1 ? `+${surplus}` : ""}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {minToHHMM(i.startMin)}–{minToHHMM(i.endMin)}: {hrs(i.planned * 60)} geplant / {i.required} benötigt
                          {gap > 1e-9 && ` – ${Math.ceil(gap - 1e-9)} fehlt`}
                          {surplus >= 1 && ` – ${surplus} mehr als nötig`}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            )}

            <ContextMenu onOpenChange={(o) => !o && setMenu(null)}>
              {rows.map((emp) => {
                const own = dayShifts.filter((s) => s.employeeId === emp.id);
                const dayWork = own.reduce((s, sh) => s + workMinutes(sh.segments, acts), 0);
                const weekWork = shifts.filter((s) => s.employeeId === emp.id).reduce((s, sh) => s + workMinutes(sh.segments, acts), 0);
                const empWarnings = canEdit ? warnings.filter((w) => w.employeeId === emp.id && (!w.date || w.date === date)) : [];
                const level = empWarnings.some((w) => w.level === "error")
                  ? "error"
                  : empWarnings.some((w) => w.level === "warning")
                    ? "warning"
                    : empWarnings.length
                      ? "info"
                      : null;
                const lane = (
                  <div
                    data-lane
                    className={cn("relative h-12", canEdit && own.length === 0 && "cursor-copy")}
                    onClick={() => canEdit && own.length === 0 && onCreate?.(emp.id, date)}
                    onContextMenu={canEdit ? (e) => openMenu(e, emp.id) : undefined}
                  >
                    {windows.map((w, i) => (
                      <div
                        key={i}
                        className="absolute inset-y-0 bg-primary/[0.04]"
                        style={{ left: pct(w.startMin), width: width(w.startMin, w.endMin) }}
                      />
                    ))}
                    {hours.map((h) => (
                      <div key={h} className="absolute inset-y-0 border-l border-dashed border-border/70" style={{ left: pct(h) }} />
                    ))}

                    {own.map((s) => {
                      const len = s.endMin - s.startMin;
                      const active = dragging === s.id;
                      return (
                        <div
                          key={s.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`Schicht ${minToHHMM(s.startMin)}–${minToHHMM(s.endMin)} bearbeiten`}
                          onKeyDown={(e) => e.key === "Enter" && canEdit && onEdit?.(s)}
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => beginDrag(e, s)}
                          onPointerMove={(e) => onPointerMove(e, s)}
                          onPointerUp={endDrag}
                          onPointerCancel={endDrag}
                          className={cn(
                            "group absolute top-2 bottom-2 flex touch-none rounded-md shadow-xs ring-1 ring-black/5 select-none",
                            canEdit && "hover:ring-2 hover:ring-primary/50",
                            active && "z-10 cursor-grabbing ring-2 ring-primary shadow-md",
                          )}
                          style={{ left: pct(s.startMin), width: width(s.startMin, s.endMin) }}
                        >
                          {s.segments.map((seg, i) => {
                            const act = acts[seg.activityTypeId];
                            return (
                              <div
                                key={i}
                                title={`${act?.name} ${minToHHMM(seg.startMin)}–${minToHHMM(seg.endMin)}`}
                                className="flex h-full items-center overflow-hidden px-1.5 text-[11px] font-medium whitespace-nowrap text-white first:rounded-l-md last:rounded-r-md"
                                style={{
                                  width: `${((seg.endMin - seg.startMin) / len) * 100}%`,
                                  backgroundColor: act?.color,
                                  opacity: act?.isBreak ? 0.55 : 1,
                                }}
                              >
                                {active
                                  ? seg.endMin - seg.startMin >= 45 && `${minToHHMM(seg.startMin)}–${minToHHMM(seg.endMin)}`
                                  : seg.endMin - seg.startMin >= 60 && act?.name}
                              </div>
                            );
                          })}

                          {/* sichtbare Griffe (nur Optik – die Greifzonen berechnet hitTest) */}
                          {canEdit && (
                            <>
                              <Grip left="0%" edge />
                              {s.segments.slice(0, -1).map((seg, i) => (
                                <Grip key={i} left={`${((seg.endMin - s.startMin) / len) * 100}%`} />
                              ))}
                              <Grip left="100%" edge />
                            </>
                          )}

                          {active && (
                            <div className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 rounded-md bg-foreground px-1.5 py-0.5 text-[11px] whitespace-nowrap text-background tabular-nums">
                              {minToHHMM(s.startMin)}–{minToHHMM(s.endMin)} · {hrs(workMinutes(s.segments, acts))} h
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );

                return (
                  <div
                    key={emp.id}
                    className={cn(
                      "grid grid-cols-[200px_1fr] border-b last:border-b-0",
                      highlightEmployeeId === emp.id && "bg-primary/5",
                      level === "error" && "bg-destructive/[0.04]",
                    )}
                  >
                    <div className="flex items-center gap-2 px-4 py-2 text-sm">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: emp.color }} />
                      <div className="min-w-0 flex-1 leading-tight">
                        <div className="truncate">
                          {emp.firstName} {emp.lastName}
                        </div>
                        {canEdit && (
                          <div className="text-[11px] text-muted-foreground tabular-nums">
                            {own.length > 0 && <>{hrs(dayWork)} h heute · </>}
                            <span className={cn(weekWork - emp.weeklyHours * 60 > 60 && "font-medium text-destructive")}>
                              {hrs(weekWork)}
                            </span>{" "}
                            / {hrs(emp.weeklyHours * 60)} h Woche
                          </div>
                        )}
                      </div>
                      {level && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label={`${empWarnings.length} Hinweise für ${emp.firstName}`}
                              className={cn(
                                "flex size-6 shrink-0 items-center justify-center rounded-md",
                                level === "error" && "bg-destructive/15 text-destructive",
                                level === "warning" && "bg-warning/20 text-warning",
                                level === "info" && "text-muted-foreground",
                              )}
                            >
                              {level === "info" ? <Info className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="flex-col items-start gap-1">
                            {empWarnings.map((w, i) => (
                              <div key={i}>• {w.message}</div>
                            ))}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    {canEdit ? <ContextMenuTrigger asChild>{lane}</ContextMenuTrigger> : lane}
                  </div>
                );
              })}

              {canEdit && menu && (
                <ContextMenuContent className="w-60">
                  <ContextMenuLabel className="text-xs font-normal text-muted-foreground">
                    {menuEmp?.firstName} · {fmtDay(parseDateOnly(date), "EEE dd.MM.")} · {minToHHMM(menu.minute)}
                  </ContextMenuLabel>
                  <ContextMenuSub>
                    <ContextMenuSubTrigger>Block hinzufügen</ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-48">
                      {data.activities.map((a) => (
                        <ContextMenuItem key={a.id} onSelect={() => addBlock(menu, a.id)}>
                          <span className="size-2.5 rounded-sm" style={{ backgroundColor: a.color }} />
                          {a.name}
                          <span className="ml-auto text-xs text-muted-foreground">{a.isBreak ? "30 min" : "1 h"}</span>
                        </ContextMenuItem>
                      ))}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  {menuSeg && (
                    <>
                      <ContextMenuSeparator />
                      <ContextMenuLabel className="text-xs font-normal text-muted-foreground">
                        {acts[menuSeg.activityTypeId]?.name} {minToHHMM(menuSeg.startMin)}–{minToHHMM(menuSeg.endMin)}
                      </ContextMenuLabel>
                      <ContextMenuSub>
                        <ContextMenuSubTrigger>Umwandeln in</ContextMenuSubTrigger>
                        <ContextMenuSubContent className="w-48">
                          {data.activities
                            .filter((a) => a.id !== menuSeg.activityTypeId)
                            .map((a) => (
                              <ContextMenuItem key={a.id} onSelect={() => changeSegment(menu, a.id)}>
                                <span className="size-2.5 rounded-sm" style={{ backgroundColor: a.color }} />
                                {a.name}
                              </ContextMenuItem>
                            ))}
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                      <ContextMenuItem variant="destructive" onSelect={() => deleteSegment(menu)}>
                        Block entfernen
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem onSelect={() => menu.shift && onEdit?.(menu.shift)}>Schicht-Details öffnen …</ContextMenuItem>
                    </>
                  )}
                </ContextMenuContent>
              )}
            </ContextMenu>

            {rows.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted-foreground">Keine Schichten an diesem Tag.</p>}
          </div>
        </div>

        {canEdit && (
          <p className="text-xs text-muted-foreground">
            Ränder und Grenzen ziehen = Zeiten ändern · Block in der Mitte ziehen = verschieben · Klick = Details · Rechtsklick =
            Block hinzufügen, umwandeln oder entfernen
          </p>
        )}

        {liveDemand && <CoveragePanel demand={liveDemand} />}

        {canEdit && outboundId && (
          <OvercoverageDialog
            open={overOpen}
            onOpenChange={setOverOpen}
            suggestions={suggestions}
            shifts={dayShifts}
            employees={data.employees}
            outboundId={outboundId}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

function Grip({ left, edge }: { left: string; edge?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute top-1/2 h-5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow ring-1 ring-black/20 transition group-hover:opacity-90",
        edge && "h-6",
      )}
      style={{ left }}
    />
  );
}

/** Verlängert die letzte Aktivität bis `end` (falls ein neuer Block über das Schichtende hinausgeht). */
function extendTo(segments: SegmentDTO[], end: number): SegmentDTO[] {
  const last = segments[segments.length - 1];
  if (!last || last.endMin >= end) return segments;
  return [...segments.slice(0, -1), { ...last, endMin: end }];
}

function sameShape(a: ShiftShape, b: ShiftShape) {
  return (
    a.startMin === b.startMin &&
    a.endMin === b.endMin &&
    a.segments.length === b.segments.length &&
    a.segments.every(
      (s, i) => s.startMin === b.segments[i].startMin && s.endMin === b.segments[i].endMin && s.activityTypeId === b.segments[i].activityTypeId,
    )
  );
}
