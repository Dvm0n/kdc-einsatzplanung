"use client";

import { useState } from "react";
import type { DayDemand } from "@/lib/demand";
import { fmtDay, minToHHMM, parseDateOnly } from "@/lib/time";
import { cn } from "@/lib/utils";

/** Tag × Intervall: Hintergrund = Anrufvolumen (einfarbig hell→dunkel), Zahl = Anrufe oder Bedarf */
export function ForecastHeatmap({ days }: { days: DayDemand[] }) {
  const [mode, setMode] = useState<"calls" | "agents">("agents");
  const starts = [...new Set(days.flatMap((d) => d.intervals.map((i) => i.startMin)))].sort((a, b) => a - b);
  const max = Math.max(1, ...days.flatMap((d) => d.intervals.map((i) => i.calls)));
  const lookup = new Map(days.map((d) => [d.date, new Map(d.intervals.map((i) => [i.startMin, i]))]));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="flex rounded-lg border p-0.5 text-sm">
          {(
            [
              ["agents", "Benötigte Operator"],
              ["calls", "Anrufe"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setMode(k)}
              className={cn("rounded-md px-3 py-1 text-muted-foreground", mode === k && "bg-muted font-medium text-foreground")}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          wenig
          <div className="h-2 w-24 rounded-full bg-gradient-to-r from-primary/5 to-primary/70" />
          viele Anrufe
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-[2px] text-xs tabular-nums">
          <thead>
            <tr>
              <th className="w-14" />
              {days.map((d) => (
                <th key={d.date} className="pb-1 font-medium">
                  {fmtDay(parseDateOnly(d.date), "EEE dd.MM.")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {starts.map((s) => (
              <tr key={s}>
                <td className="pr-2 text-right text-muted-foreground">{minToHHMM(s)}</td>
                {days.map((d) => {
                  const i = lookup.get(d.date)?.get(s);
                  if (!i) return <td key={d.date} className="rounded bg-muted/40" />;
                  const intensity = i.calls / max;
                  const under = i.planned + 1e-9 < i.required;
                  return (
                    <td
                      key={d.date}
                      title={`${Math.round(i.calls * 10) / 10} Anrufe · Ø ${Math.round(i.ahtSeconds)} s · ${i.required} Operator netto · ${
                        Math.round(i.planned * 10) / 10
                      } geplant`}
                      className={cn("relative h-7 rounded text-center", intensity > 0.55 && "text-primary-foreground")}
                      style={{ backgroundColor: `color-mix(in oklch, var(--primary) ${Math.round(5 + intensity * 70)}%, transparent)` }}
                    >
                      {mode === "calls" ? Math.round(i.calls) : i.required}
                      {under && (
                        <span className="absolute top-1 right-1 size-1.5 rounded-full bg-destructive ring-1 ring-card" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="size-1.5 rounded-full bg-destructive" /> Roter Punkt: im aktuellen Plan unterdeckt
      </p>
    </div>
  );
}
