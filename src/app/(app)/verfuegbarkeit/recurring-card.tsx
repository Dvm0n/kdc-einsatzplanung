"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { hhmmToMin, minToHHMM, WEEKDAY_NAMES } from "@/lib/time";
import { cn } from "@/lib/utils";
import { saveRecurringAvailability } from "./actions";
import { KIND_META, type AvailKind } from "./kinds";

type Row = { weekday: number; startMin: number; endMin: number; kind: AvailKind };

export function RecurringCard({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();

  const update = (next: Row[]) => {
    setRows(next);
    setDirty(true);
  };

  function save() {
    startTransition(async () => {
      const r = await saveRecurringAvailability(rows.map((x) => ({ ...x, date: null })));
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      setDirty(false);
    });
  }

  return (
    <SectionCard
      title="Regelmäßige Woche"
      description="Wann du normalerweise arbeiten kannst oder möchtest. Tage ohne Eintrag gelten als flexibel."
      actions={
        <Button onClick={save} disabled={!dirty || pending}>
          Speichern
        </Button>
      }
    >
      <div className="divide-y">
        {WEEKDAY_NAMES.map((name, i) => {
          const weekday = i + 1;
          const list = rows.map((r, idx) => ({ ...r, idx })).filter((r) => r.weekday === weekday);
          return (
            <div key={weekday} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start">
              <div className="w-28 pt-1.5 text-sm font-medium">{name}</div>
              <div className="flex flex-1 flex-col gap-2">
                {list.length === 0 && <span className="pt-1.5 text-sm text-muted-foreground">flexibel</span>}
                {list.map((r) => (
                  <div key={r.idx} className={cn("flex flex-wrap items-center gap-1.5 rounded-lg border p-1.5", KIND_META[r.kind].className)}>
                    <Select
                      value={r.kind}
                      onValueChange={(v) => update(rows.map((x, j) => (j === r.idx ? { ...x, kind: v as AvailKind } : x)))}
                    >
                      <SelectTrigger size="sm" className="w-40 bg-background text-foreground" aria-label="Art">
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
                    <Input
                      type="time"
                      step={900}
                      aria-label="Von"
                      className="h-7 w-28 bg-background text-foreground"
                      value={minToHHMM(r.startMin)}
                      onChange={(e) =>
                        e.target.value && update(rows.map((x, j) => (j === r.idx ? { ...x, startMin: hhmmToMin(e.target.value) } : x)))
                      }
                    />
                    <span className="text-muted-foreground">–</span>
                    <Input
                      type="time"
                      step={900}
                      aria-label="Bis"
                      className="h-7 w-28 bg-background text-foreground"
                      value={minToHHMM(r.endMin)}
                      onChange={(e) =>
                        e.target.value && update(rows.map((x, j) => (j === r.idx ? { ...x, endMin: hhmmToMin(e.target.value) } : x)))
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Entfernen"
                      className="ml-auto text-muted-foreground"
                      onClick={() => update(rows.filter((_, j) => j !== r.idx))}
                    >
                      <X />
                    </Button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => update([...rows, { weekday, startMin: 8 * 60, endMin: 13 * 60, kind: "PREFERRED" }])}
                  >
                    <Plus /> Vormittag
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => update([...rows, { weekday, startMin: 13 * 60, endMin: 18 * 60, kind: "PREFERRED" }])}
                  >
                    <Plus /> Nachmittag
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => update([...rows, { weekday, startMin: 0, endMin: 24 * 60 - 15, kind: "UNAVAILABLE" }])}
                  >
                    <Plus /> Ganzer Tag nicht
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
