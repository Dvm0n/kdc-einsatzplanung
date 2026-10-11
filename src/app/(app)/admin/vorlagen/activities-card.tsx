"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { saveActivity } from "./actions";

type Activity = {
  id?: string;
  key?: string;
  name: string;
  color: string;
  isPhoneTime: boolean;
  isWorkTime: boolean;
  isBreak: boolean;
};

export function ActivitiesCard({ activities }: { activities: Activity[] }) {
  const [rows, setRows] = useState<Activity[]>(activities);
  const [dirty, setDirty] = useState<Set<number>>(new Set());
  const [pending, startTransition] = useTransition();

  function change(i: number, patch: Partial<Activity>) {
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    setDirty((d) => new Set(d).add(i));
  }

  function saveAll() {
    startTransition(async () => {
      for (const i of dirty) {
        const r = await saveActivity(rows[i]);
        if (!r.ok) { toast.error(r.error); return; }
      }
      setDirty(new Set());
      toast.success("Aktivitäten gespeichert");
    });
  }

  return (
    <SectionCard
      title="Aktivitäten"
      description="Was ein Operator in einem Zeitabschnitt tut. Nur Aktivitäten mit „Telefon-Inbound“ zählen für die Abdeckung des Anrufbedarfs."
      actions={
        <>
          <Button
            variant="outline"
            onClick={() => {
              setRows((r) => [...r, { name: "", color: "#64748b", isPhoneTime: false, isWorkTime: true, isBreak: false }]);
              setDirty((d) => new Set(d).add(rows.length));
            }}
          >
            <Plus /> Aktivität
          </Button>
          <Button onClick={saveAll} disabled={pending || dirty.size === 0}>
            Speichern
          </Button>
        </>
      }
    >
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-1 pb-2 font-normal">Farbe</th>
              <th className="px-1 pb-2 font-normal">Name</th>
              <th className="px-1 pb-2 text-center font-normal">Telefon-Inbound</th>
              <th className="px-1 pb-2 text-center font-normal">Arbeitszeit</th>
              <th className="px-1 pb-2 text-center font-normal">Pause</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a, i) => (
              <tr key={a.id ?? `new-${i}`} className="border-t">
                <td className="px-1 py-2">
                  <input
                    type="color"
                    aria-label="Farbe"
                    value={a.color}
                    onChange={(e) => change(i, { color: e.target.value })}
                    className="size-7 cursor-pointer rounded-md border bg-transparent p-0.5"
                  />
                </td>
                <td className="px-1 py-2">
                  <Input value={a.name} placeholder="Name" onChange={(e) => change(i, { name: e.target.value })} />
                </td>
                <td className="px-1 py-2 text-center">
                  <Switch checked={a.isPhoneTime} onCheckedChange={(c) => change(i, { isPhoneTime: c })} />
                </td>
                <td className="px-1 py-2 text-center">
                  <Switch checked={a.isWorkTime} onCheckedChange={(c) => change(i, { isWorkTime: c })} />
                </td>
                <td className="px-1 py-2 text-center">
                  <Switch
                    checked={a.isBreak}
                    onCheckedChange={(c) => change(i, { isBreak: c, ...(c ? { isWorkTime: false, isPhoneTime: false } : {}) })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
