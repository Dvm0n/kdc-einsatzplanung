"use client";

import { useEffect, useState, useTransition } from "react";
import { Hand, UserCheck } from "lucide-react";
import { toast } from "sonner";
import {
  assignOpenShift,
  bidOpenShift,
  cancelOpenShift,
  createOpenShift,
} from "@/app/(app)/plan/open-shift-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { OpenShiftDTO } from "@/lib/open-shifts";
import type { ActivityDTO, EmployeeDTO } from "@/lib/planning/types";
import { fmtDay, hhmmToMin, minToHHMM, parseDateOnly } from "@/lib/time";
import { cn } from "@/lib/utils";
import { SegmentStrip } from "./shift-bar";

type Result = { ok: boolean; message?: string; error?: string };

function useRun(onDone?: () => void) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.message) toast.success(r.message);
      onDone?.();
    });
  return { pending, run };
}

/** Offene Schicht ansehen – Planung teilt zu, Operator meldet sich */
export function OpenShiftDialog({
  shift,
  onClose,
  activities,
  employees,
  planner,
  myEmployeeId,
  conflicts,
}: {
  shift: OpenShiftDTO | null;
  onClose: () => void;
  activities: ActivityDTO[];
  employees?: EmployeeDTO[];
  planner: boolean;
  myEmployeeId?: string | null;
  /** Mitarbeiter-ID → Grund, warum die Person diese Schicht nicht übernehmen kann */
  conflicts?: Record<string, string>;
}) {
  const acts = Object.fromEntries(activities.map((a) => [a.id, a]));
  const { pending, run } = useRun(onClose);
  const [other, setOther] = useState("");
  useEffect(() => setOther(""), [shift?.id]);
  if (!shift) return null;

  const mine = !!myEmployeeId && shift.offeredBy?.id === myEmployeeId;
  const iBid = !!myEmployeeId && shift.bids.some((b) => b.employeeId === myEmployeeId);
  const myConflict = myEmployeeId ? conflicts?.[myEmployeeId] : undefined;
  const others = (employees ?? []).filter(
    (e) => e.id !== shift.offeredBy?.id && !shift.bids.some((b) => b.employeeId === e.id),
  );

  return (
    <Dialog open={!!shift} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Offene Schicht</DialogTitle>
          <DialogDescription>
            {fmtDay(parseDateOnly(shift.date), "EEEE, dd.MM.")} · {minToHHMM(shift.startMin)}–{minToHHMM(shift.endMin)}
            {shift.offeredBy ? ` · abgegeben von ${shift.offeredBy.name}` : " · von der Planung ausgeschrieben"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <SegmentStrip startMin={shift.startMin} endMin={shift.endMin} segments={shift.segments} activities={acts} className="h-2" />
            <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              {shift.segments.map((s, i) => (
                <span key={i}>
                  {minToHHMM(s.startMin)}–{minToHHMM(s.endMin)} {acts[s.activityTypeId]?.name}
                </span>
              ))}
            </div>
            {shift.note && <p className="text-sm">„{shift.note}“</p>}
          </div>

          {planner ? (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                {shift.bids.length ? `${shift.bids.length} Meldung(en)` : "Noch keine Meldungen"}
              </div>
              {shift.bids.map((b) => (
                <div key={b.employeeId} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                  <span className="flex-1 text-sm font-medium">{b.name}</span>
                  {conflicts?.[b.employeeId] && <span className="text-xs text-destructive">{conflicts[b.employeeId]}</span>}
                  <Button size="sm" disabled={pending} onClick={() => run(() => assignOpenShift(shift.id, b.employeeId))}>
                    <UserCheck /> Zuteilen
                  </Button>
                </div>
              ))}
              {others.length > 0 && (
                <div className="flex items-center gap-2 pt-1">
                  <Select value={other} onValueChange={setOther}>
                    <SelectTrigger className="flex-1" aria-label="Jemand anderem zuteilen">
                      <SelectValue placeholder="Jemand anderem zuteilen …" />
                    </SelectTrigger>
                    <SelectContent>
                      {others.map((e) => (
                        <SelectItem key={e.id} value={e.id} disabled={!!conflicts?.[e.id]}>
                          {e.firstName} {e.lastName}
                          {conflicts?.[e.id] && <span className="text-xs text-muted-foreground"> – {conflicts[e.id]}</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" disabled={!other || pending} onClick={() => run(() => assignOpenShift(shift.id, other))}>
                    Zuteilen
                  </Button>
                </div>
              )}
            </div>
          ) : (
            !mine && (
              <p className={cn("text-sm", myConflict ? "text-destructive" : "text-muted-foreground")}>
                {myConflict
                  ? `Du kannst diese Schicht nicht übernehmen: ${myConflict}.`
                  : iBid
                    ? "Du hast dich gemeldet. Die Planung entscheidet und du wirst benachrichtigt."
                    : `${shift.bids.length ? `${shift.bids.length} Kolleg:innen haben sich gemeldet. ` : ""}Die Planung entscheidet, wer übernimmt.`}
              </p>
            )
          )}
        </div>

        <DialogFooter className="gap-2">
          {(planner || mine) && (
            <Button variant="ghost" disabled={pending} onClick={() => run(() => cancelOpenShift(shift.id))}>
              {mine ? "Angebot zurückziehen" : "Ausschreibung zurückziehen"}
            </Button>
          )}
          {!planner && !mine && (
            iBid ? (
              <Button variant="outline" disabled={pending} onClick={() => run(() => bidOpenShift(shift.id, false))}>
                Meldung zurückziehen
              </Button>
            ) : (
              <Button disabled={pending || !!myConflict} onClick={() => run(() => bidOpenShift(shift.id, true))}>
                <Hand /> Ich übernehme
              </Button>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Planung: Schicht ausschreiben */
export function CreateOpenShiftDialog({
  date,
  days,
  onClose,
  activities,
  templates,
}: {
  date: string | null;
  days: string[];
  onClose: () => void;
  activities: ActivityDTO[];
  templates: { id: string; name: string; startMin: number; endMin: number; activityTypeId: string }[];
}) {
  const work = activities.filter((a) => !a.isBreak);
  const [form, setForm] = useState({ date: "", start: "08:00", end: "12:00", activityTypeId: "", note: "" });
  const { pending, run } = useRun(onClose);

  useEffect(() => {
    if (date) {
      const inbound = activities.find((a) => a.isPhoneTime) ?? activities[0];
      setForm({ date, start: "08:00", end: "12:00", activityTypeId: inbound?.id ?? "", note: "" });
    }
  }, [date, activities]);

  return (
    <Dialog open={!!date} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schicht ausschreiben</DialogTitle>
          <DialogDescription>Alle Operator werden benachrichtigt und können sich melden. Du entscheidest, wer übernimmt.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {templates.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({ ...f, start: minToHHMM(t.startMin), end: minToHHMM(t.endMin), activityTypeId: t.activityTypeId }))
                  }
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition hover:border-primary/50",
                    form.start === minToHHMM(t.startMin) && form.end === minToHHMM(t.endMin) && "border-primary bg-primary/10 text-primary",
                  )}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Tag</span>
              <Select value={form.date} onValueChange={(v) => setForm({ ...form, date: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {days.map((d) => (
                    <SelectItem key={d} value={d}>
                      {fmtDay(parseDateOnly(d), "EEEE, dd.MM.")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Beginn</span>
              <Input type="time" step={900} value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Ende</span>
              <Input type="time" step={900} value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
            </label>
            <label className="col-span-2 space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Aktivität</span>
              <Select value={form.activityTypeId} onValueChange={(v) => setForm({ ...form, activityTypeId: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {work.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="size-2 rounded-full" style={{ backgroundColor: a.color }} />
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="col-span-2 space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Hinweis (optional)</span>
              <Textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            disabled={pending || !form.date || !form.activityTypeId}
            onClick={() =>
              run(() =>
                createOpenShift({
                  date: form.date,
                  startMin: hhmmToMin(form.start),
                  endMin: hhmmToMin(form.end),
                  activityTypeId: form.activityTypeId,
                  note: form.note,
                }),
              )
            }
          >
            Ausschreiben
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Kleines Kärtchen für die Zeile „Offene Schichten“ */
export function OpenShiftChip({
  shift,
  activities,
  onClick,
  highlight,
}: {
  shift: OpenShiftDTO;
  activities: Record<string, ActivityDTO>;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 px-2 py-1.5 text-left transition hover:border-primary",
        highlight && "border-primary bg-primary/10",
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-1 text-xs font-medium whitespace-nowrap tabular-nums max-xl:text-[11px]">
        <span>
          {minToHHMM(shift.startMin)}–{minToHHMM(shift.endMin)}
        </span>
        {shift.bids.length > 0 && (
          <span className="rounded bg-primary px-1 text-[10px] text-primary-foreground" title={`${shift.bids.length} Meldung(en)`}>
            {shift.bids.length} <Hand className="inline size-2.5" />
          </span>
        )}
      </div>
      <SegmentStrip startMin={shift.startMin} endMin={shift.endMin} segments={shift.segments} activities={activities} />
      {shift.offeredBy && <div className="mt-1 truncate text-[10px] text-muted-foreground">von {shift.offeredBy.name.split(" ")[0]}</div>}
    </button>
  );
}
