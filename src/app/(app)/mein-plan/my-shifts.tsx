"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { SegmentStrip } from "@/components/planner/shift-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ABSENCE_LABEL } from "@/lib/labels";
import type { AbsenceDTO, ActivityDTO, ShiftDTO } from "@/lib/planning/types";
import { fmtDay, hhmmToMin, minToHHMM, parseDateOnly } from "@/lib/time";
import { cn } from "@/lib/utils";
import { requestChange } from "./actions";

type Holiday = { date: string; name: string; closed: boolean };

export function MyShifts({
  days,
  shifts,
  activities,
  absences,
  holidays,
  colleagues,
  pendingShiftIds,
  today,
}: {
  days: string[];
  shifts: ShiftDTO[];
  activities: ActivityDTO[];
  absences: AbsenceDTO[];
  holidays: Holiday[];
  colleagues: { id: string; name: string }[];
  pendingShiftIds: string[];
  today: string;
}) {
  const acts = Object.fromEntries(activities.map((a) => [a.id, a]));
  const [target, setTarget] = useState<ShiftDTO | null>(null);

  return (
    <div className="space-y-2">
      {days.map((d) => {
        const own = shifts.filter((s) => s.date === d).sort((a, b) => a.startMin - b.startMin);
        const absence = absences.find((a) => a.startDate <= d && a.endDate >= d);
        const hol = holidays.find((h) => h.date === d);
        const past = d < today;
        return (
          <div
            key={d}
            className={cn(
              "flex gap-4 rounded-2xl border bg-card p-4",
              d === today && "border-primary/40 ring-1 ring-primary/20",
              past && "opacity-60",
            )}
          >
            <div className="w-12 shrink-0 text-center">
              <div className="text-xs text-muted-foreground uppercase">{fmtDay(parseDateOnly(d), "EEE")}</div>
              <div className={cn("text-xl font-semibold", d === today && "text-primary")}>{fmtDay(parseDateOnly(d), "dd")}</div>
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              {hol && <div className="text-xs font-medium text-warning">{hol.name}</div>}
              {absence && <Badge variant="secondary">{ABSENCE_LABEL[absence.kind]}</Badge>}
              {own.length === 0 && !absence && <div className="py-1 text-sm text-muted-foreground">Frei</div>}
              {own.map((s) => {
                const pending = pendingShiftIds.includes(s.id);
                return (
                  <div key={s.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium tabular-nums">
                        {minToHHMM(s.startMin)} – {minToHHMM(s.endMin)}
                      </div>
                      {pending ? (
                        <Badge variant="outline">Antrag offen</Badge>
                      ) : (
                        !past && (
                          <Button variant="ghost" size="sm" onClick={() => setTarget(s)}>
                            Ändern
                          </Button>
                        )
                      )}
                    </div>
                    <SegmentStrip startMin={s.startMin} endMin={s.endMin} segments={s.segments} activities={acts} className="h-2" />
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {s.segments.map((seg, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <span className="size-2 rounded-sm" style={{ backgroundColor: acts[seg.activityTypeId]?.color }} />
                          {minToHHMM(seg.startMin)}–{minToHHMM(seg.endMin)} {acts[seg.activityTypeId]?.name}
                        </span>
                      ))}
                    </div>
                    {s.note && <p className="text-xs text-muted-foreground">„{s.note}“</p>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <ChangeDialog shift={target} onClose={() => setTarget(null)} colleagues={colleagues} />
    </div>
  );
}

function ChangeDialog({
  shift,
  onClose,
  colleagues,
}: {
  shift: ShiftDTO | null;
  onClose: () => void;
  colleagues: { id: string; name: string }[];
}) {
  const [type, setType] = useState<"CHANGE_TIME" | "DAY_OFF" | "SWAP">("CHANGE_TIME");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [partner, setPartner] = useState<string>("");
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();

  function open(o: boolean) {
    if (!o) onClose();
  }

  function submit() {
    if (!shift) return;
    startTransition(async () => {
      const r = await requestChange({
        shiftId: shift.id,
        type,
        proposedStart: type === "CHANGE_TIME" && start ? hhmmToMin(start) : null,
        proposedEnd: type === "CHANGE_TIME" && end ? hhmmToMin(end) : null,
        swapPartnerId: type === "SWAP" ? partner || null : null,
        comment,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      setComment("");
      onClose();
    });
  }

  const options = [
    { k: "CHANGE_TIME", label: "Andere Zeit", desc: "Ich kann nur zu einer anderen Uhrzeit" },
    { k: "DAY_OFF", label: "Frei nehmen", desc: "Ich kann an diesem Tag nicht" },
    { k: "SWAP", label: "Abgeben", desc: "Kollegin / Kollege übernimmt" },
  ] as const;

  return (
    <Dialog
      open={!!shift}
      onOpenChange={(o) => {
        if (o && shift) {
          setStart(minToHHMM(shift.startMin));
          setEnd(minToHHMM(shift.endMin));
        }
        open(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Änderung beantragen</DialogTitle>
          <DialogDescription>
            {shift && `${fmtDay(parseDateOnly(shift.date), "EEEE, dd.MM.")} · ${minToHHMM(shift.startMin)}–${minToHHMM(shift.endMin)}`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {options.map((o) => (
              <button
                key={o.k}
                type="button"
                onClick={() => {
                  setType(o.k);
                  if (shift && !start) {
                    setStart(minToHHMM(shift.startMin));
                    setEnd(minToHHMM(shift.endMin));
                  }
                }}
                className={cn(
                  "rounded-xl border p-3 text-left transition hover:border-primary/50",
                  type === o.k && "border-primary bg-primary/5",
                )}
              >
                <div className="text-sm font-medium">{o.label}</div>
                <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{o.desc}</div>
              </button>
            ))}
          </div>

          {type === "CHANGE_TIME" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Von</span>
                <Input type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Bis</span>
                <Input type="time" step={900} value={end} onChange={(e) => setEnd(e.target.value)} />
              </label>
            </div>
          )}

          {type === "SWAP" && (
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Wer soll übernehmen?</span>
              <Select value={partner} onValueChange={setPartner}>
                <SelectTrigger className="w-full" aria-label="Kollegin oder Kollege">
                  <SelectValue placeholder="Auswählen …" />
                </SelectTrigger>
                <SelectContent>
                  {colleagues.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Die Person muss zusagen, danach gibt die Planung den Tausch frei.</p>
            </div>
          )}

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Begründung (optional)</span>
            <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Senden …" : "Antrag senden"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
