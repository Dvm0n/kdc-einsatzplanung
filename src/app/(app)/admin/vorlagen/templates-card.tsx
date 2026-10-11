"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { hhmmToMin, hoursLabel, minToHHMM } from "@/lib/time";
import { deleteTemplate, saveTemplate } from "./actions";

type Template = { id?: string; name: string; startMin: number; endMin: number; activityTypeId: string };
type Activity = { id: string; name: string; color: string; isBreak: boolean };

export function TemplatesCard({ templates, activities }: { templates: Template[]; activities: Activity[] }) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Template | null>(null);
  const workActivities = activities.filter((a) => !a.isBreak);
  const actById = Object.fromEntries(activities.map((a) => [a.id, a]));

  function save(t: Template) {
    startTransition(async () => {
      const r = await saveTemplate(t);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success(r.message);
      setDraft(null);
    });
  }

  return (
    <SectionCard
      title="Schichtvorlagen"
      description="Bausteine für die schnelle Planung, z. B. „Vormittag“ oder „Nachmittag“. Pausen werden bei der Planung automatisch ergänzt."
      actions={
        <Button
          variant="outline"
          onClick={() =>
            setDraft({ name: "", startMin: 8 * 60, endMin: 12 * 60, activityTypeId: workActivities[0]?.id ?? "" })
          }
        >
          <Plus /> Vorlage
        </Button>
      }
    >
      <div className="divide-y">
        {[...templates, ...(draft && !draft.id ? [draft] : [])].map((t, i) => {
          const editing = draft && (draft.id ? draft.id === t.id : !t.id);
          const row = editing ? draft! : t;
          const act = actById[row.activityTypeId];
          if (!editing) {
            return (
              <div key={t.id ?? i} className="flex items-center gap-3 py-2.5">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: act?.color }} />
                <button className="flex-1 text-left text-sm font-medium hover:underline" onClick={() => setDraft(t)}>
                  {t.name}
                </button>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {minToHHMM(t.startMin)}–{minToHHMM(t.endMin)}
                </span>
                <span className="hidden w-16 text-right text-xs text-muted-foreground sm:block">
                  {hoursLabel(t.endMin - t.startMin)}
                </span>
                <span className="hidden w-24 text-xs text-muted-foreground sm:block">{act?.name}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Löschen"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await deleteTemplate(t.id!);
                      if (r.ok) toast.success(r.message);
                    })
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            );
          }
          return (
            <form
              key={t.id ?? "new"}
              className="flex flex-wrap items-center gap-2 py-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                save(draft!);
              }}
            >
              <Input
                autoFocus
                placeholder="Name"
                className="min-w-36 flex-1"
                value={row.name}
                onChange={(e) => setDraft({ ...row, name: e.target.value })}
                required
              />
              <Input
                type="time"
                step={900}
                className="w-28"
                value={minToHHMM(row.startMin)}
                onChange={(e) => setDraft({ ...row, startMin: hhmmToMin(e.target.value) })}
              />
              <Input
                type="time"
                step={900}
                className="w-28"
                value={minToHHMM(row.endMin)}
                onChange={(e) => setDraft({ ...row, endMin: hhmmToMin(e.target.value) })}
              />
              <Select value={row.activityTypeId} onValueChange={(v) => setDraft({ ...row, activityTypeId: v })}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {workActivities.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="submit" disabled={pending}>
                Speichern
              </Button>
              <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                Abbrechen
              </Button>
            </form>
          );
        })}
      </div>
    </SectionCard>
  );
}
