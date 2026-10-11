"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FEDERAL_STATES } from "@/lib/holidays";
import { WEEKDAY_NAMES } from "@/lib/time";
import { saveParameters, type ParamsInput } from "./actions";

type Values = {
  intervalMinutes: number;
  serviceLevelTarget: number;
  serviceLevelSeconds: number;
  maxOccupancy: number;
  shrinkage: number;
  forecastWeeks: number;
  wishDeadlineWeekday: number;
  wishDeadlineHour: number;
  federalState: string;
};

export function ParametersCard({ initial }: { initial: Values }) {
  const [v, setV] = useState<ParamsInput>(initial);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof Values, value: string | number) => setV((s) => ({ ...s, [k]: value }));

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await saveParameters(v);
      if (!r.ok) toast.error(r.error);
      else toast.success(r.message);
    });
  }

  return (
    <form onSubmit={save}>
      <SectionCard
        title="Planungsparameter"
        description="Grundlage für die Erlang-C-Bedarfsberechnung und den Planungsablauf."
        actions={
          <Button type="submit" disabled={pending}>
            {pending ? "Speichern …" : "Speichern"}
          </Button>
        }
      >
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Service Level" hint="Anteil der Anrufe, die schnell angenommen werden sollen">
            <Suffix suffix="%">
              <Input type="number" min={1} max={100} value={String(v.serviceLevelTarget)} onChange={(e) => set("serviceLevelTarget", e.target.value)} />
            </Suffix>
          </Field>
          <Field label="… innerhalb von" hint="Zielzeit bis zur Annahme">
            <Suffix suffix="Sek.">
              <Input type="number" min={1} value={String(v.serviceLevelSeconds)} onChange={(e) => set("serviceLevelSeconds", e.target.value)} />
            </Suffix>
          </Field>
          <Field label="Max. Auslastung" hint="Obergrenze der Belastung je Operator">
            <Suffix suffix="%">
              <Input type="number" min={50} max={100} value={String(v.maxOccupancy)} onChange={(e) => set("maxOccupancy", e.target.value)} />
            </Suffix>
          </Field>
          <Field label="Shrinkage" hint="Zuschlag für Pausen, Krankheit, Schulung, Nacharbeit">
            <Suffix suffix="%">
              <Input type="number" min={0} max={80} value={String(v.shrinkage)} onChange={(e) => set("shrinkage", e.target.value)} />
            </Suffix>
          </Field>
          <Field label="Intervall" hint="Raster für Bedarf und Planung">
            <Select value={String(v.intervalMinutes)} onValueChange={(x) => set("intervalMinutes", x)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 Minuten</SelectItem>
                <SelectItem value="30">30 Minuten</SelectItem>
                <SelectItem value="60">60 Minuten</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Historie für Prognose" hint="Anzahl vergangener Wochen">
            <Suffix suffix="Wochen">
              <Input type="number" min={1} max={52} value={String(v.forecastWeeks)} onChange={(e) => set("forecastWeeks", e.target.value)} />
            </Suffix>
          </Field>
          <Field label="Wunsch-Deadline" hint="Wochentag in der Vorwoche">
            <Select value={String(v.wishDeadlineWeekday)} onValueChange={(x) => set("wishDeadlineWeekday", x)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAY_NAMES.map((n, i) => (
                  <SelectItem key={n} value={String(i + 1)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="… bis" hint="Uhrzeit">
            <Suffix suffix="Uhr">
              <Input type="number" min={0} max={23} value={String(v.wishDeadlineHour)} onChange={(e) => set("wishDeadlineHour", e.target.value)} />
            </Suffix>
          </Field>
          <Field label="Bundesland" hint="Für gesetzliche Feiertage">
            <Select value={String(v.federalState)} onValueChange={(x) => set("federalState", x)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FEDERAL_STATES).map(([k, n]) => (
                  <SelectItem key={k} value={k}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </SectionCard>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Suffix({ suffix, children }: { suffix: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
        {suffix}
      </span>
    </div>
  );
}
