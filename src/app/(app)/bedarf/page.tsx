import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { computeWeekDemand, loadDemandInputs } from "@/lib/demand";
import { loadWeek } from "@/lib/schedule";
import { requirePlanner } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import {
  addDaysUTC,
  fmtDay,
  fmtWeekRange,
  formatDateOnly,
  isoWeekNumber,
  parseDateOnly,
  toDateOnly,
  weekStartOf,
} from "@/lib/time";
import { AdjustmentInput } from "./adjustment-input";
import { BatchList } from "./batch-list";
import { ForecastHeatmap } from "./forecast-heatmap";
import { ImportCard } from "./import-card";

export default async function DemandPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  await requirePlanner();
  const sp = await searchParams;
  const base = sp.w && /^\d{4}-\d{2}-\d{2}$/.test(sp.w) ? parseDateOnly(sp.w) : addDaysUTC(toDateOnly(new Date()), 7);
  const weekStart = weekStartOf(base);
  const [week, demandInputs, settings, batches, adjustments] = await Promise.all([
    loadWeek(weekStart),
    loadDemandInputs(weekStart),
    getSettings(),
    db.importBatch.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    db.forecastAdjustment.findMany({ where: { date: { gte: weekStart, lte: addDaysUTC(weekStart, 6) } } }),
  ]);
  const { days, hasHistory } = await computeWeekDemand(weekStart, week.shifts, week.activities, demandInputs);
  const adjByDate = Object.fromEntries(adjustments.map((a) => [formatDateOnly(a.date), Math.round((a.factor - 1) * 100)]));
  const weekIso = formatDateOnly(weekStart);
  const totalCalls = days.reduce((s, d) => s + d.summary.calls, 0);
  const agentHours = days.reduce(
    (s, d) => s + d.intervals.reduce((x, i) => x + (i.requiredGross * (i.endMin - i.startMin)) / 60, 0),
    0,
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Bedarf"
        description={`Prognose aus den letzten ${settings.forecastWeeks} Wochen · Service Level ${Math.round(
          settings.serviceLevelTarget * 100,
        )}/${settings.serviceLevelSeconds} · Shrinkage ${Math.round(settings.shrinkage * 100)} %`}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border bg-card">
              <Button variant="ghost" size="icon" asChild aria-label="Vorherige Woche">
                <Link href={`/bedarf?w=${formatDateOnly(addDaysUTC(weekStart, -7))}`}>
                  <ChevronLeft />
                </Link>
              </Button>
              <span className="px-2 text-sm font-medium">KW {isoWeekNumber(weekStart)}</span>
              <Button variant="ghost" size="icon" asChild aria-label="Nächste Woche">
                <Link href={`/bedarf?w=${formatDateOnly(addDaysUTC(weekStart, 7))}`}>
                  <ChevronRight />
                </Link>
              </Button>
            </div>
            <Button variant="outline" asChild>
              <Link href={`/plan?w=${weekIso}`}>Zum Plan</Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Erwartete Anrufe" value={Math.round(totalCalls).toLocaleString("de-DE")} hint={fmtWeekRange(weekStart)} />
        <Kpi
          label="Benötigte Telefonstunden"
          value={`${Math.round(agentHours).toLocaleString("de-DE")} h`}
          hint="inkl. Shrinkage"
        />
        <Kpi
          label="Unterdeckte Intervalle"
          value={String(days.reduce((s, d) => s + d.summary.underCount, 0))}
          hint="mit aktuellem Plan"
        />
      </div>

      <SectionCard
        title="Prognose je Intervall"
        description="Erwartete Anrufe und benötigte Operator (netto, Erlang C). Korrekturen pro Tag z. B. für Mailings oder Aktionen."
      >
        {!hasHistory ? (
          <p className="text-sm text-muted-foreground">Noch keine Anrufhistorie vorhanden – bitte unten importieren.</p>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {days.map((d) => (
                <div key={d.date} className="rounded-xl border p-3">
                  <div className="text-sm font-medium">{fmtDay(parseDateOnly(d.date), "EEE dd.MM.")}</div>
                  <div className="mb-2 text-xs text-muted-foreground">
                    {d.closed ? "geschlossen" : `${Math.round(d.summary.calls)} Anrufe`}
                  </div>
                  {!d.closed && <AdjustmentInput date={d.date} initial={adjByDate[d.date] ?? 0} />}
                </div>
              ))}
            </div>
            <ForecastHeatmap days={days} />
          </>
        )}
      </SectionCard>

      <ImportCard />
      <BatchList
        batches={batches.map((b) => ({
          id: b.id,
          fileName: b.fileName,
          rowCount: b.rowCount,
          from: formatDateOnly(b.fromDate),
          to: formatDateOnly(b.toDate),
          createdAt: b.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
