"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hhmmToMin, minToHHMM, WEEKDAY_NAMES } from "@/lib/time";
import { saveServiceHours } from "./actions";

type Window = { weekday: number; startMin: number; endMin: number };

export function ServiceHoursCard({ initial }: { initial: Window[] }) {
  const [windows, setWindows] = useState<Window[]>(initial);
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);

  function update(next: Window[]) {
    setWindows(next);
    setDirty(true);
  }

  function save() {
    startTransition(async () => {
      const r = await saveServiceHours(windows);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success(r.message);
      setDirty(false);
    });
  }

  return (
    <SectionCard
      title="Offizielle Call-Zeiten"
      description="In diesen Zeiten wird Inbound-Bedarf berechnet und geplant. Mehrere Zeitfenster pro Tag sind möglich."
      actions={
        <Button onClick={save} disabled={!dirty || pending}>
          {pending ? "Speichern …" : "Speichern"}
        </Button>
      }
    >
      <div className="divide-y">
        {WEEKDAY_NAMES.map((name, i) => {
          const weekday = i + 1;
          const dayWindows = windows.map((w, idx) => ({ ...w, idx })).filter((w) => w.weekday === weekday);
          return (
            <div key={weekday} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
              <div className="w-28 text-sm font-medium">{name}</div>
              <div className="flex flex-1 flex-wrap items-center gap-2">
                {dayWindows.length === 0 && <span className="text-sm text-muted-foreground">Geschlossen</span>}
                {dayWindows.map((w) => (
                  <div key={w.idx} className="flex items-center gap-1 rounded-lg border bg-background p-1">
                    <Input
                      type="time"
                      step={900}
                      className="h-7 w-[6.5rem] border-0 shadow-none"
                      value={minToHHMM(w.startMin)}
                      onChange={(e) =>
                        update(windows.map((x, j) => (j === w.idx ? { ...x, startMin: hhmmToMin(e.target.value) } : x)))
                      }
                    />
                    <span className="text-muted-foreground">–</span>
                    <Input
                      type="time"
                      step={900}
                      className="h-7 w-[6.5rem] border-0 shadow-none"
                      value={minToHHMM(w.endMin)}
                      onChange={(e) =>
                        update(windows.map((x, j) => (j === w.idx ? { ...x, endMin: hhmmToMin(e.target.value) } : x)))
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Zeitfenster entfernen"
                      onClick={() => update(windows.filter((_, j) => j !== w.idx))}
                    >
                      <X />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => update([...windows, { weekday, startMin: 8 * 60, endMin: 18 * 60 }])}
                >
                  <Plus /> Zeitfenster
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
