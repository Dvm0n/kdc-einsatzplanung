"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ABSENCE_LABEL } from "@/lib/labels";
import { recordAbsence } from "./actions";

type Kind = "VACATION" | "OFF" | "SICK" | "OTHER";

export function RecordAbsence({ employees }: { employees: { id: string; name: string }[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: "", kind: "SICK" as Kind, startDate: today, endDate: today });
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!form.employeeId) {
      toast.error("Bitte Mitarbeiter auswählen");
      return;
    }
    startTransition(async () => {
      const r = await recordAbsence(form);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus /> Abwesenheit eintragen
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Abwesenheit eintragen</DialogTitle>
          <DialogDescription>Z. B. Krankmeldung. Schichten im Zeitraum werden entfernt und die Person benachrichtigt.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Mitarbeiter</span>
            <Select value={form.employeeId} onValueChange={(v) => setForm({ ...form, employeeId: v })}>
              <SelectTrigger className="w-full" aria-label="Mitarbeiter">
                <SelectValue placeholder="Auswählen …" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Art</span>
            <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as Kind })}>
              <SelectTrigger className="w-full" aria-label="Art">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ABSENCE_LABEL) as Kind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {ABSENCE_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Von</span>
            <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Bis</span>
            <Input type="date" min={form.startDate} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Abbrechen
          </Button>
          <Button onClick={submit} disabled={pending}>
            Eintragen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
