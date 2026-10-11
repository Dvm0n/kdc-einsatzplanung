"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { fmtDay, hhmmToMin, minToHHMM, parseDateOnly } from "@/lib/time";
import { addHoliday, deleteHoliday, importHolidays } from "./actions";

type Holiday = { id: string; date: string; name: string; closed: boolean; startMin: number | null; endMin: number | null };

export function HolidaysCard({ holidays }: { holidays: Holiday[] }) {
  const [pending, startTransition] = useTransition();
  const year = new Date().getFullYear();
  const [form, setForm] = useState({ date: "", name: "", closed: true, start: "09:00", end: "13:00" });

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else toast.success(r.message);
    });

  return (
    <SectionCard
      title="Feiertage & Sonderzeiten"
      description="An geschlossenen Tagen wird kein Bedarf berechnet. Sonderzeiten ersetzen die regulären Call-Zeiten."
      actions={
        <>
          <Button variant="outline" disabled={pending} onClick={() => run(() => importHolidays(year))}>
            Feiertage {year}
          </Button>
          <Button variant="outline" disabled={pending} onClick={() => run(() => importHolidays(year + 1))}>
            {year + 1}
          </Button>
        </>
      }
    >
      <form
        className="mb-5 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const r = await addHoliday({
              date: form.date,
              name: form.name,
              closed: form.closed,
              startMin: hhmmToMin(form.start),
              endMin: hhmmToMin(form.end),
            });
            if (r.ok) setForm({ ...form, date: "", name: "" });
            return r;
          });
        }}
      >
        <Input type="date" className="w-40" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        <Input
          placeholder="Bezeichnung, z. B. Heiligabend"
          className="min-w-48 flex-1"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <label className="flex h-8 items-center gap-2 px-1 text-sm">
          <Checkbox checked={form.closed} onCheckedChange={(c) => setForm({ ...form, closed: c === true })} />
          geschlossen
        </label>
        {!form.closed && (
          <>
            <Input type="time" className="w-28" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
            <Input type="time" className="w-28" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
          </>
        )}
        <Button type="submit" variant="secondary" disabled={pending}>
          Hinzufügen
        </Button>
      </form>

      {holidays.length === 0 ? (
        <EmptyState title="Keine kommenden Feiertage">Übernimm die gesetzlichen Feiertage mit einem Klick oben rechts.</EmptyState>
      ) : (
        <div className="divide-y">
          {holidays.map((h) => (
            <div key={h.id} className="flex items-center gap-3 py-2">
              <span className="w-28 text-sm text-muted-foreground tabular-nums">
                {fmtDay(parseDateOnly(h.date), "EEE dd.MM.yy")}
              </span>
              <span className="flex-1 text-sm">{h.name}</span>
              {h.closed ? (
                <Badge variant="secondary">geschlossen</Badge>
              ) : (
                <Badge variant="outline">
                  {minToHHMM(h.startMin ?? 0)}–{minToHHMM(h.endMin ?? 0)}
                </Badge>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Entfernen"
                disabled={pending}
                onClick={() => run(() => deleteHoliday(h.id))}
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
