"use client";

import { useEffect, useState } from "react";
import { PhoneOutgoing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { applySuggestions, type OutboundSuggestion } from "@/lib/planning/overcoverage";
import type { EmployeeDTO, SegmentDTO, ShiftDTO } from "@/lib/planning/types";
import { minToHHMM } from "@/lib/time";

export function OvercoverageDialog({
  open,
  onOpenChange,
  suggestions,
  shifts,
  employees,
  outboundId,
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  suggestions: OutboundSuggestion[];
  shifts: ShiftDTO[];
  employees: EmployeeDTO[];
  outboundId: string;
  /** Übernimmt die Änderung (inkl. Rückgängig-Verlauf in der Tagesansicht) */
  onApply: (items: { id: string; startMin: number; endMin: number; segments: SegmentDTO[] }[], message: string) => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const name = Object.fromEntries(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));

  useEffect(() => {
    if (open) setSelected(new Set(suggestions.map((_, i) => i)));
  }, [open, suggestions]);

  const hours = suggestions.filter((_, i) => selected.has(i)).reduce((s, x) => s + (x.endMin - x.startMin) / 60, 0);

  function apply() {
    const chosen = suggestions.filter((_, i) => selected.has(i));
    const segs = applySuggestions(shifts, chosen, outboundId);
    const items = [...segs.entries()].map(([id, segments]) => {
      const s = shifts.find((x) => x.id === id)!;
      return { id, startMin: s.startMin, endMin: s.endMin, segments };
    });
    onApply(items, `${hours.toLocaleString("de-DE")} h auf Outbound umgestellt`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Überdeckung für Outbound nutzen</DialogTitle>
          <DialogDescription>
            In diesen Zeiten sind mehr Operator am Telefon als laut Bedarf nötig. Die ausgewählten Zeiten werden auf Outbound
            umgestellt – der Inbound-Bedarf bleibt gedeckt.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {suggestions.map((s, i) => (
            <label key={i} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/50">
              <Checkbox
                checked={selected.has(i)}
                onCheckedChange={(c) =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (c) next.add(i);
                    else next.delete(i);
                    return next;
                  })
                }
              />
              <span className="flex-1 text-sm font-medium">{name[s.employeeId]}</span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {minToHHMM(s.startMin)}–{minToHHMM(s.endMin)}
              </span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={apply} disabled={selected.size === 0}>
            <PhoneOutgoing /> {hours.toLocaleString("de-DE")} h auf Outbound
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
