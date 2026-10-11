"use client";

import type { DayDemand } from "@/lib/demand";
import { cn } from "@/lib/utils";
import { CoverageChart } from "./coverage-chart";

export function CoveragePanel({ demand }: { demand: DayDemand }) {
  if (demand.closed) {
    return <p className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">Geschlossen – kein Anrufbedarf.</p>;
  }
  const s = demand.summary;
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-medium">Bedarf &amp; Abdeckung</h2>
          <p className="text-sm text-muted-foreground">Prognose aus der Anrufhistorie, Personalbedarf nach Erlang C.</p>
        </div>
        <div className="flex gap-6 text-sm">
          <Stat label="Erwartete Anrufe" value={Math.round(s.calls).toLocaleString("de-DE")} />
          <Stat label="Erwartetes Service Level" value={s.expectedSL == null ? "–" : `${Math.round(s.expectedSL * 100)} %`} />
          <Stat
            label="Intervalle unterdeckt"
            value={String(s.underCount)}
            tone={s.underCount > 0 ? "text-destructive" : "text-success"}
          />
        </div>
      </div>
      <CoverageChart intervals={demand.intervals} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-semibold tabular-nums", tone)}>{value}</div>
    </div>
  );
}
