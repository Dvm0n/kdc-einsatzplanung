"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ShiftDTO } from "@/lib/planning/types";
import { fmtDay, hhmmToMin, minToHHMM, parseDateOnly } from "@/lib/time";
import { cn } from "@/lib/utils";
import { requestChange } from "./actions";


export function ChangeDialog({
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
