"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDay, hhmmToMin, minToHHMM, parseDateOnly } from "@/lib/time";
import { cn } from "@/lib/utils";
import { addAvailabilityException, deleteAvailability } from "./actions";
import { KIND_META, type AvailKind } from "./kinds";

type Item = { id: string; date: string; startMin: number; endMin: number; kind: AvailKind; note: string | null };

export function ExceptionsCard({ items }: { items: Item[] }) {
  const [form, setForm] = useState({ date: "", start: "08:00", end: "18:00", kind: "UNAVAILABLE" as AvailKind, note: "" });
  const [pending, startTransition] = useTransition();

  function add(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await addAvailabilityException({
        weekday: null,
        date: form.date,
        startMin: hhmmToMin(form.start),
        endMin: hhmmToMin(form.end),
        kind: form.kind,
        note: form.note || null,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      setForm({ ...form, date: "", note: "" });
    });
  }

  return (
    <SectionCard
      title="Einzelne Tage"
      description="Abweichungen von deiner regelmäßigen Woche, z. B. ein Arzttermin oder ein Tag, an dem du gern länger arbeitest."
    >
      <form onSubmit={add} className="mb-4 flex flex-wrap items-center gap-2">
        <Input type="date" aria-label="Datum" className="w-40" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <Input type="time" step={900} aria-label="Von" className="w-28" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
        <Input type="time" step={900} aria-label="Bis" className="w-28" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
        <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as AvailKind })}>
          <SelectTrigger className="w-40" aria-label="Art">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(KIND_META) as AvailKind[]).map((k) => (
              <SelectItem key={k} value={k}>
                {KIND_META[k].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input placeholder="Notiz (optional)" className="min-w-40 flex-1" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <Button type="submit" variant="secondary" disabled={pending}>
          Hinzufügen
        </Button>
      </form>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine Einträge.</p>
      ) : (
        <div className="divide-y">
          {items.map((i) => (
            <div key={i.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-28 text-muted-foreground">{fmtDay(parseDateOnly(i.date), "EEE dd.MM.yy")}</span>
              <span className="w-28 tabular-nums">
                {minToHHMM(i.startMin)}–{minToHHMM(i.endMin)}
              </span>
              <Badge variant="outline" className={cn(KIND_META[i.kind].className)}>
                {KIND_META[i.kind].label}
              </Badge>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{i.note}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Entfernen"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await deleteAvailability(i.id);
                  })
                }
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
