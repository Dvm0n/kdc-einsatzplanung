"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { deleteShift, saveShift } from "@/app/(app)/plan/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { buildSegments, workMinutes } from "@/lib/planning/shifts";
import type { ActivityDTO, SegmentDTO, ShiftDTO } from "@/lib/planning/types";
import type { WeekData } from "@/lib/schedule";
import { fmtDay, hhmmToMin, hoursLabel, minToHHMM, parseDateOnly } from "@/lib/time";
import { cn } from "@/lib/utils";
import { SegmentStrip } from "./shift-bar";

export type ShiftDraft = {
  id?: string;
  employeeId: string;
  date: string;
  startMin: number;
  endMin: number;
  activityTypeId: string;
  autoBreak: boolean;
  segments: SegmentDTO[];
  note: string;
};

export function draftFromShift(s: ShiftDTO, activities: ActivityDTO[]): ShiftDraft {
  const acts = Object.fromEntries(activities.map((a) => [a.id, a]));
  const durations = new Map<string, number>();
  for (const seg of s.segments) {
    if (acts[seg.activityTypeId]?.isBreak) continue;
    durations.set(seg.activityTypeId, (durations.get(seg.activityTypeId) ?? 0) + seg.endMin - seg.startMin);
  }
  const main = [...durations.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? activities[0].id;
  return {
    id: s.id,
    employeeId: s.employeeId,
    date: s.date,
    startMin: s.startMin,
    endMin: s.endMin,
    activityTypeId: main,
    autoBreak: false,
    segments: s.segments,
    note: s.note ?? "",
  };
}

export function ShiftSheet({
  open,
  onOpenChange,
  initial,
  data,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: ShiftDraft | null;
  data: WeekData;
}) {
  const [d, setD] = useState<ShiftDraft | null>(initial);
  const [pending, startTransition] = useTransition();
  const acts = useMemo(() => Object.fromEntries(data.activities.map((a) => [a.id, a])), [data.activities]);
  const breakAct = data.activities.find((a) => a.isBreak);
  const workActs = data.activities.filter((a) => !a.isBreak);

  useEffect(() => {
    if (open) setD(initial);
  }, [open, initial]);

  if (!d) return null;

  const recompute = (next: ShiftDraft): ShiftDraft =>
    next.autoBreak
      ? {
          ...next,
          segments: buildSegments(next.startMin, next.endMin, next.activityTypeId, breakAct?.id ?? null, data.settings),
        }
      : next;

  const update = (patch: Partial<ShiftDraft>) => setD((cur) => (cur ? recompute({ ...cur, ...patch }) : cur));

  function applyTemplate(t: WeekData["templates"][number]) {
    update({ startMin: t.startMin, endMin: t.endMin, activityTypeId: t.activityTypeId, autoBreak: true });
  }

  function setSegment(i: number, patch: Partial<SegmentDTO>) {
    setD((cur) =>
      cur ? { ...cur, autoBreak: false, segments: cur.segments.map((s, j) => (j === i ? { ...s, ...patch } : s)) } : cur,
    );
  }

  function addSegment() {
    setD((cur) => {
      if (!cur) return cur;
      const last = cur.segments[cur.segments.length - 1];
      const start = last ? Math.min(last.endMin, cur.endMin - 15) : cur.startMin;
      return {
        ...cur,
        autoBreak: false,
        segments: [...cur.segments, { activityTypeId: cur.activityTypeId, startMin: start, endMin: cur.endMin }],
      };
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!d) return;
    startTransition(async () => {
      const r = await saveShift({ ...d, note: d.note || null });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      onOpenChange(false);
    });
  }

  function remove() {
    if (!d?.id) return;
    startTransition(async () => {
      const r = await deleteShift(d.id!);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      onOpenChange(false);
    });
  }

  const emp = data.employees.find((e) => e.id === d.employeeId);
  const work = workMinutes(d.segments, acts);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{d.id ? "Schicht bearbeiten" : "Neue Schicht"}</SheetTitle>
          <SheetDescription>
            {emp ? `${emp.firstName} ${emp.lastName}` : ""} · {fmtDay(parseDateOnly(d.date), "EEEE, dd.MM.yyyy")}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={submit} className="flex flex-1 flex-col">
          <div className="space-y-6 px-4">
            {data.templates.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground">Vorlage</span>
                <div className="flex flex-wrap gap-1.5">
                  {data.templates.map((t) => {
                    const active = t.startMin === d.startMin && t.endMin === d.endMin && t.activityTypeId === d.activityTypeId;
                    return (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() => applyTemplate(t)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs transition hover:border-primary/50",
                          active && "border-primary bg-primary/10 text-primary",
                        )}
                      >
                        {t.name}{" "}
                        <span className="text-muted-foreground">
                          {minToHHMM(t.startMin)}–{minToHHMM(t.endMin)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Mitarbeiter</span>
                <Select value={d.employeeId} onValueChange={(v) => update({ employeeId: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {data.employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.firstName} {e.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Tag</span>
                <Select value={d.date} onValueChange={(v) => update({ date: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {data.days.map((day) => (
                      <SelectItem key={day} value={day}>
                        {fmtDay(parseDateOnly(day), "EEE dd.MM.")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Beginn</span>
                <Input
                  type="time"
                  step={900}
                  value={minToHHMM(d.startMin)}
                  onChange={(e) => e.target.value && update({ startMin: hhmmToMin(e.target.value) })}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Ende</span>
                <Input
                  type="time"
                  step={900}
                  value={minToHHMM(d.endMin)}
                  onChange={(e) => e.target.value && update({ endMin: hhmmToMin(e.target.value) })}
                />
              </label>
              <label className="col-span-2 space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Hauptaktivität</span>
                <Select value={d.activityTypeId} onValueChange={(v) => update({ activityTypeId: v, autoBreak: true })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {workActs.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <span className="size-2 rounded-full" style={{ backgroundColor: a.color }} />
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>

            <div className="space-y-3 rounded-xl border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Ablauf</div>
                  <div className="text-xs text-muted-foreground">
                    {hoursLabel(work)} Arbeitszeit · {hoursLabel(d.endMin - d.startMin - work)} Pause
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Pause automatisch
                  <Switch checked={d.autoBreak} onCheckedChange={(c) => update({ autoBreak: c })} />
                </label>
              </div>
              <SegmentStrip startMin={d.startMin} endMin={d.endMin} segments={d.segments} activities={acts} className="h-2" />
              <div className="space-y-1.5">
                {d.segments.map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Select value={s.activityTypeId} onValueChange={(v) => setSegment(i, { activityTypeId: v })}>
                      <SelectTrigger size="sm" className="min-w-0 flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {data.activities.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            <span className="size-2 rounded-full" style={{ backgroundColor: a.color }} />
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="time"
                      step={900}
                      className="h-7 w-[6.25rem] shrink-0 px-2 text-xs"
                      value={minToHHMM(s.startMin)}
                      onChange={(e) => e.target.value && setSegment(i, { startMin: hhmmToMin(e.target.value) })}
                    />
                    <Input
                      type="time"
                      step={900}
                      className="h-7 w-[6.25rem] shrink-0 px-2 text-xs"
                      value={minToHHMM(s.endMin)}
                      onChange={(e) => e.target.value && setSegment(i, { endMin: hhmmToMin(e.target.value) })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Abschnitt entfernen"
                      onClick={() =>
                        setD((cur) => (cur ? { ...cur, autoBreak: false, segments: cur.segments.filter((_, j) => j !== i) } : cur))
                      }
                    >
                      <X />
                    </Button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={addSegment}>
                <Plus /> Abschnitt
              </Button>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Notiz (für alle sichtbar)</span>
              <Textarea rows={2} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} />
            </label>
          </div>

          <SheetFooter className="mt-auto flex-row justify-between">
            {d.id ? (
              <Button type="button" variant="destructive" onClick={remove} disabled={pending}>
                <Trash2 /> Löschen
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={pending}>
              {pending ? "Speichern …" : "Speichern"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
