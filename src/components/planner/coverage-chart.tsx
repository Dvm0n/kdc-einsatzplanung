"use client";

import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CoverageInterval } from "@/lib/planning/coverage";
import { minToHHMM } from "@/lib/time";

const fmt = (n: number, d = 1) => n.toLocaleString("de-DE", { maximumFractionDigits: d });

export function CoverageChart({ intervals, height = 220 }: { intervals: CoverageInterval[]; height?: number }) {
  const data = intervals.map((i) => ({
    label: minToHHMM(i.startMin),
    ...i,
    under: i.planned + 1e-9 < i.required,
  }));

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary" /> Geplant am Telefon
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-destructive" /> Unterdeckung
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-foreground" /> Bedarf netto (Erlang C)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0 w-4 border-t-2 border-dashed border-muted-foreground" /> Bedarf inkl. Shrinkage
        </span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<CoverageTooltip />} />
          <Bar dataKey="planned" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.under ? "var(--destructive)" : "var(--primary)"} fillOpacity={d.under ? 0.85 : 0.7} />
            ))}
          </Bar>
          <Line
            dataKey="required"
            type="step"
            stroke="var(--foreground)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="requiredGross"
            type="step"
            stroke="var(--muted-foreground)"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

type TooltipProps = { active?: boolean; payload?: { payload: CoverageInterval & { under: boolean } }[] };

function CoverageTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="min-w-48 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1.5 font-medium">
        {minToHHMM(d.startMin)}–{minToHHMM(d.endMin)}
      </div>
      <Row label="Erwartete Anrufe" value={fmt(d.calls)} />
      <Row label="Ø Gesprächsdauer" value={`${Math.round(d.ahtSeconds)} s`} />
      <Row label="Bedarf netto" value={String(d.required)} />
      <Row label="Bedarf inkl. Shrinkage" value={fmt(d.requiredGross)} />
      <Row label="Geplant" value={fmt(d.planned)} strong />
      {d.expectedSL != null && <Row label="Erwartetes Service Level" value={`${Math.round(d.expectedSL * 100)} %`} />}
      {d.under && (
        <div className="mt-1.5 font-medium text-destructive">
          ▲ {fmt(d.required - d.planned)} Person(en) fehlen
        </div>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-medium" : ""}>{value}</span>
    </div>
  );
}

/** Kompakte Ampel-Leiste für den Kopf der Wochenansicht */
export function CoverageStrip({ intervals }: { intervals: CoverageInterval[] }) {
  if (intervals.length === 0) return <div className="h-1.5" />;
  return (
    <div className="flex h-1.5 gap-px overflow-hidden rounded-full">
      {intervals.map((i) => {
        const gap = i.required - i.planned;
        const cls = gap >= 1 ? "bg-destructive" : gap > 1e-9 ? "bg-warning" : "bg-success/70";
        return (
          <div
            key={i.startMin}
            className={`flex-1 ${cls}`}
            title={`${minToHHMM(i.startMin)}: ${i.planned.toLocaleString("de-DE", { maximumFractionDigits: 1 })} geplant / ${i.required} benötigt`}
          />
        );
      })}
    </div>
  );
}
