"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ABSENCE_LABEL } from "@/lib/labels";
import { fmtDay, parseDateOnly } from "@/lib/time";
import { cancelAbsence, requestAbsence } from "./actions";

type Item = {
  id: string;
  kind: string;
  startDate: string;
  endDate: string;
  status: string;
  comment: string | null;
  adminComment: string | null;
};

export function AbsenceCard({ items }: { items: Item[] }) {
  const [form, setForm] = useState({ kind: "VACATION" as "VACATION" | "OFF" | "OTHER", startDate: "", endDate: "", comment: "" });
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await requestAbsence({ ...form, endDate: form.endDate || form.startDate });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      setForm({ ...form, startDate: "", endDate: "", comment: "" });
    });
  }

  const days = (a: Item) => Math.round((Date.parse(a.endDate) - Date.parse(a.startDate)) / 86_400_000) + 1;

  return (
    <SectionCard title="Urlaub & freie Tage" description="Genehmigte Abwesenheiten werden im Plan automatisch berücksichtigt.">
      <form onSubmit={submit} className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as typeof form.kind })}>
          <SelectTrigger className="w-32" aria-label="Art">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="VACATION">Urlaub</SelectItem>
            <SelectItem value="OFF">Frei</SelectItem>
            <SelectItem value="OTHER">Sonstiges</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" aria-label="Von" className="w-40" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
        <span className="text-muted-foreground">bis</span>
        <Input type="date" aria-label="Bis" className="w-40" min={form.startDate} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
        <Input placeholder="Kommentar (optional)" className="min-w-40 flex-1" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
        <Button type="submit" disabled={pending}>
          Beantragen
        </Button>
      </form>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Anträge.</p>
      ) : (
        <div className="divide-y">
          {items.map((a) => (
            <div key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {ABSENCE_LABEL[a.kind]}{" "}
                  <span className="font-normal text-muted-foreground">
                    · {fmtDay(parseDateOnly(a.startDate), "dd.MM.")} – {fmtDay(parseDateOnly(a.endDate), "dd.MM.yyyy")} ({days(a)}{" "}
                    {days(a) === 1 ? "Tag" : "Tage"})
                  </span>
                </div>
                {a.adminComment && <div className="text-xs text-muted-foreground">Planung: „{a.adminComment}“</div>}
              </div>
              <StatusBadge status={a.status} />
              {a.status === "PENDING" && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await cancelAbsence(a.id);
                      if (!r.ok) toast.error(r.error);
                      else toast.success(r.message);
                    })
                  }
                >
                  Zurückziehen
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
