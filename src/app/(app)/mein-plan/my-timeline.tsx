"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, Clock, Info } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ABSENCE_LABEL } from "@/lib/labels";
import type { ShiftChange } from "@/lib/planning/changes";
import { applyDrag, hitTest, snap, type DragHandle, type ShiftShape } from "@/lib/planning/resize";
import { validateWeek, type AvailabilityBlock, type RuleSettings } from "@/lib/planning/rules";
import { workMinutes } from "@/lib/planning/shifts";
import type { AbsenceDTO, ActivityDTO, EmployeeDTO, SegmentDTO, ServiceWindow, ShiftDTO } from "@/lib/planning/types";
import { fmtDay, isoWeekday, minToHHMM, parseDateOnly } from "@/lib/time";
import { cn } from "@/lib/utils";
import { requestChange } from "./actions";
import { ChangeDialog } from "./my-shifts";

const hrs = (m: number) => (m / 60).toLocaleString("de-DE", { maximumFractionDigits: 2 });
const DRAG_THRESHOLD = 4;
const CURSOR: Record<DragHandle["kind"], string> = {
  start: "ew-resize",
  end: "ew-resize",
  boundary: "col-resize",
  move: "grab",
  shift: "grab",
};

export type PendingProposal = {
  shiftId: string;
  type: string;
  proposedStart: number | null;
  proposedEnd: number | null;
  proposedSegments: SegmentDTO[] | null;
};

type Drag = { shift: ShiftDTO; handle: DragHandle; x0: number; laneWidth: number; moved: boolean };

export function MyTimeline({
  me,
  days,
  shifts,
  activities,
  absences,
  holidays,
  serviceHours,
  pending,
  colleagues,
  today,
  rules,
  changes = [],
}: {
  changes?: ShiftChange[];
  me: EmployeeDTO;
  days: string[];
  shifts: ShiftDTO[];
  activities: ActivityDTO[];
  absences: AbsenceDTO[];
  holidays: { date: string; name: string; closed: boolean }[];
  serviceHours: ServiceWindow[];
  pending: PendingProposal[];
  colleagues: { id: string; name: string }[];
  today: string;
  rules: { unavailable: AvailabilityBlock[]; previousShifts: ShiftDTO[]; closedDates: string[]; settings: RuleSettings } | null;
}) {
  const acts = useMemo(() => Object.fromEntries(activities.map((a) => [a.id, a])), [activities]) as Record<string, ActivityDTO>;
  const [draft, setDraft] = useState<{ shift: ShiftDTO; shape: ShiftShape } | null>(null);
  const [comment, setComment] = useState("");
  const [dialogShift, setDialogShift] = useState<ShiftDTO | null>(null);
  const drag = useRef<Drag | null>(null);
  const [sending, startTransition] = useTransition();

  // Gemeinsame Zeitachse für die ganze Woche
  const allStarts = [...serviceHours.map((w) => w.startMin), ...shifts.map((s) => s.startMin), 8 * 60];
  const allEnds = [...serviceHours.map((w) => w.endMin), ...shifts.map((s) => s.endMin), 17 * 60];
  const from = Math.max(0, Math.floor(Math.min(...allStarts) / 60) * 60 - 60);
  const to = Math.min(1440, Math.ceil(Math.max(...allEnds) / 60) * 60 + 60);
  const span = to - from;
  const pct = (m: number) => `${((m - from) / span) * 100}%`;
  const width = (a: number, b: number) => `${((b - a) / span) * 100}%`;
  const hours = Array.from({ length: span / 60 + 1 }, (_, i) => from + i * 60);

  const shown = useMemo(
    () => shifts.map((s) => (draft?.shift.id === s.id ? { ...s, ...draft.shape } : s)),
    [shifts, draft],
  );

  // Hinweise für den Entwurf (nur die eigenen Schichten)
  const draftWarnings = useMemo(() => {
    if (!draft || !rules) return [];
    return validateWeek({
      shifts: shown,
      employees: [me],
      activities,
      absences,
      serviceHours,
      ...rules,
    }).filter((w) => !w.date || w.date === draft.shift.date);
  }, [draft, rules, shown, me, activities, absences, serviceHours]);

  const pendingById = new Map(pending.map((p) => [p.shiftId, p]));
  // Tage ohne Call-Zeiten (z. B. Sa/So) nur zeigen, wenn dort etwas geplant ist
  const visibleDays = days.filter(
    (d) =>
      serviceHours.some((w) => w.weekday === isoWeekday(parseDateOnly(d))) ||
      shifts.some((s) => s.date === d) ||
      changes.some((c) => c.date === d),
  );
  const weekWork = shown.reduce((s, sh) => s + workMinutes(sh.segments, acts), 0);

  function shapeOf(s: ShiftDTO): ShiftShape {
    return { startMin: s.startMin, endMin: s.endMin, segments: s.segments };
  }

  function editable(s: ShiftDTO) {
    return s.date >= today && !pendingById.has(s.id) && (!draft || draft.shift.id === s.id);
  }

  function beginDrag(e: React.PointerEvent<HTMLElement>, shift: ShiftDTO) {
    if (e.button !== 0 || !editable(shift)) return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const lane = e.currentTarget.closest("[data-lane]") as HTMLElement | null;
    if (!lane) return;
    // bei einem laufenden Entwurf weiter vom Entwurf aus ziehen
    const base = draft?.shift.id === shift.id ? { ...shift, ...draft.shape } : shift;
    const handle = hitTest(shapeOf(base), e.clientX - rect.left, rect.width);
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { shift: base, handle, x0: e.clientX, laneWidth: lane.getBoundingClientRect().width, moved: false };
  }

  function onMove(e: React.PointerEvent<HTMLElement>, shift: ShiftDTO) {
    const d = drag.current;
    if (!d) {
      if (editable(shift)) {
        const rect = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.cursor = CURSOR[hitTest(shapeOf(shift), e.clientX - rect.left, rect.width).kind];
      }
      return;
    }
    const dx = e.clientX - d.x0;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD) return;
    d.moved = true;
    const delta = snap((dx / d.laneWidth) * span);
    const original = shifts.find((s) => s.id === d.shift.id)!;
    setDraft({ shift: original, shape: applyDrag(shapeOf(d.shift), d.handle, delta, { min: from, max: to }) });
  }

  function endDrag() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved && (d.handle.kind === "shift" || d.handle.kind === "move") && !draft) {
      // einfacher Klick: weitere Möglichkeiten (frei nehmen, abgeben …)
      setDialogShift(shifts.find((s) => s.id === d.shift.id) ?? null);
    }
  }

  function send() {
    if (!draft) return;
    const { shift, shape } = draft;
    startTransition(async () => {
      const r = await requestChange({
        shiftId: shift.id,
        type: "CHANGE_TIME",
        proposedStart: shape.startMin,
        proposedEnd: shape.endMin,
        proposedSegments: shape.segments,
        swapPartnerId: null,
        comment,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      setDraft(null);
      setComment("");
    });
  }

  const unchanged =
    draft &&
    draft.shape.startMin === draft.shift.startMin &&
    draft.shape.endMin === draft.shift.endMin &&
    draft.shape.segments.every(
      (s, i) => s.startMin === draft.shift.segments[i]?.startMin && s.endMin === draft.shift.segments[i]?.endMin,
    );

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border bg-card">
        {/* Zeitachse */}
        <div className="grid grid-cols-[3.5rem_1fr] border-b sm:grid-cols-[5.5rem_1fr]">
          <div />
          <div className="relative h-7">
            {hours.map((h, i) => (
              <span
                key={h}
                className={cn(
                  "absolute top-1.5 -translate-x-1/2 text-[10px] text-muted-foreground tabular-nums sm:text-[11px]",
                  i % 2 === 1 && "max-sm:hidden",
                )}
                style={{ left: pct(h) }}
              >
                {minToHHMM(h).slice(0, 2)}
              </span>
            ))}
          </div>
        </div>

        {visibleDays.map((d) => {
          const own = shown.filter((s) => s.date === d);
          const absence = absences.find((a) => a.startDate <= d && a.endDate >= d);
          const hol = holidays.find((h) => h.date === d);
          const windows = serviceHours.filter((w) => w.weekday === isoWeekday(parseDateOnly(d)));
          const past = d < today;
          return (
            <div
              key={d}
              className={cn(
                "grid grid-cols-[3.5rem_1fr] border-b last:border-b-0 sm:grid-cols-[5.5rem_1fr]",
                d === today && "bg-primary/[0.04]",
                past && "opacity-55",
              )}
            >
              <div className="flex flex-col justify-center px-2 py-2 leading-tight sm:px-3">
                <span className={cn("text-xs font-medium", d === today && "text-primary")}>
                  {fmtDay(parseDateOnly(d), "EEE")}
                </span>
                <span className="text-[11px] text-muted-foreground">{fmtDay(parseDateOnly(d), "dd.MM.")}</span>
              </div>
              <div data-lane className="relative h-14">
                {windows.map((w, i) => (
                  <div
                    key={i}
                    className="absolute inset-y-0 bg-primary/[0.04]"
                    style={{ left: pct(w.startMin), width: width(w.startMin, w.endMin) }}
                  />
                ))}
                {hours.map((h) => (
                  <div key={h} className="absolute inset-y-0 border-l border-dashed border-border/60" style={{ left: pct(h) }} />
                ))}

                {(absence || hol) && own.length === 0 && (
                  <div className="absolute inset-0 flex items-center px-3 text-xs text-muted-foreground">
                    {absence ? ABSENCE_LABEL[absence.kind] : hol?.name}
                  </div>
                )}

                {changes
                  .filter((c) => c.kind === "removed" && c.date === d)
                  .map((c) => (
                    <div
                      key={`removed-${c.shiftId}`}
                      title="Seit Veröffentlichung gestrichen"
                      className="pointer-events-none absolute top-2.5 bottom-2.5 flex items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/40 text-[10px] text-muted-foreground line-through"
                      style={{ left: pct(c.before!.startMin), width: width(c.before!.startMin, c.before!.endMin) }}
                    >
                      gestrichen
                    </div>
                  ))}

                {own.map((s) => {
                  const len = s.endMin - s.startMin;
                  const change = changes.find((c) => c.shiftId === s.id && c.kind !== "removed");
                  const isDraft = draft?.shift.id === s.id;
                  const proposal = pendingById.get(s.id);
                  const canEdit = editable(s);
                  return (
                    <div key={s.id}>
                      {/* offener Antrag: Vorschlag gestrichelt anzeigen */}
                      {proposal?.proposedStart != null && proposal.proposedEnd != null && (
                        <div
                          className="pointer-events-none absolute top-1.5 bottom-1.5 rounded-md border-2 border-dashed border-primary/70 bg-primary/5"
                          style={{ left: pct(proposal.proposedStart), width: width(proposal.proposedStart, proposal.proposedEnd) }}
                          title="Beantragte Zeit"
                        />
                      )}
                      <div
                        role="button"
                        tabIndex={canEdit ? 0 : -1}
                        aria-label={`Schicht ${minToHHMM(s.startMin)}–${minToHHMM(s.endMin)}`}
                        onKeyDown={(e) => e.key === "Enter" && canEdit && setDialogShift(s)}
                        onPointerDown={(e) => beginDrag(e, s)}
                        onPointerMove={(e) => onMove(e, s)}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        className={cn(
                          "group absolute top-2.5 bottom-2.5 flex touch-none rounded-md shadow-xs ring-1 ring-black/5 select-none",
                          canEdit && "hover:ring-2 hover:ring-primary/50",
                          isDraft && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                          proposal && "opacity-60",
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
                              {seg.endMin - seg.startMin >= 90 && act?.name}
                            </div>
                          );
                        })}
                        {proposal ? (
                          <Badge variant="secondary" className="pointer-events-none absolute -top-2 right-1 h-4 px-1.5 text-[10px]">
                            Antrag offen
                          </Badge>
                        ) : (
                          change && (
                            <span className="pointer-events-none absolute -top-2 right-1 rounded bg-warning px-1 text-[9px] leading-3.5 font-semibold text-black/75">
                              {change.kind === "new" ? "neu" : "geändert"}
                            </span>
                          )
                        )}
                        {isDraft && (
                          <div className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 rounded bg-foreground px-1.5 text-[10px] whitespace-nowrap text-background tabular-nums">
                            {minToHHMM(s.startMin)}–{minToHHMM(s.endMin)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Entwurf bestätigen */}
      {draft && (
        <div className="space-y-3 rounded-2xl border border-primary/40 bg-primary/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-sm font-medium">
                Änderungswunsch für {fmtDay(parseDateOnly(draft.shift.date), "EEEE, dd.MM.")}
              </div>
              <div className="text-sm text-muted-foreground tabular-nums">
                {minToHHMM(draft.shift.startMin)}–{minToHHMM(draft.shift.endMin)} → {""}
                <span className="font-medium text-foreground">
                  {minToHHMM(draft.shape.startMin)}–{minToHHMM(draft.shape.endMin)}
                </span>{" "}
                · {hrs(workMinutes(draft.shape.segments, acts))} h (bisher {hrs(workMinutes(draft.shift.segments, acts))} h) · Woche{" "}
                {hrs(weekWork)} / {hrs(me.weeklyHours * 60)} h
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {draft.shape.segments.map((seg, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <span className="size-2 rounded-sm" style={{ backgroundColor: acts[seg.activityTypeId]?.color }} />
                    {minToHHMM(seg.startMin)}–{minToHHMM(seg.endMin)} {acts[seg.activityTypeId]?.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
          {draftWarnings.length > 0 && (
            <ul className="space-y-1 text-xs">
              {draftWarnings.map((w, i) => (
                <li
                  key={i}
                  className={cn(
                    "flex items-start gap-1.5",
                    w.level === "error" ? "text-destructive" : w.level === "warning" ? "text-warning" : "text-muted-foreground",
                  )}
                >
                  {w.level === "info" ? <Info className="mt-px size-3.5 shrink-0" /> : <AlertTriangle className="mt-px size-3.5 shrink-0" />}
                  {w.message}
                </li>
              ))}
            </ul>
          )}
          <Textarea
            rows={2}
            placeholder="Begründung für die Planung (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="bg-background"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(null);
                setComment("");
              }}
            >
              Verwerfen
            </Button>
            <Button onClick={send} disabled={sending || !!unchanged}>
              {sending ? "Senden …" : "Antrag senden"}
            </Button>
          </div>
        </div>
      )}

      {!draft && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Clock className="mt-px size-3.5 shrink-0" />
          Ränder oder Pausen ziehen, um eine Änderung vorzuschlagen – die Planung muss sie genehmigen. Tippen auf eine Schicht
          für „frei nehmen“ oder „abgeben“.
        </p>
      )}

      <ChangeDialog shift={dialogShift} onClose={() => setDialogShift(null)} colleagues={colleagues} />
    </div>
  );
}
