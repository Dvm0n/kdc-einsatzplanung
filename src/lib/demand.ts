import { db } from "@/lib/db";
import { computeCoverage, summarizeCoverage, type CoverageInterval } from "@/lib/planning/coverage";
import { forecastDay, toBins, type HistoryRow } from "@/lib/planning/forecast";
import type { ActivityDTO, ShiftDTO } from "@/lib/planning/types";
import { getSettings } from "@/lib/settings";
import { addDaysUTC, formatDateOnly, isoWeekday, weekDays } from "@/lib/time";

export interface DayDemand {
  date: string;
  closed: boolean;
  windows: { startMin: number; endMin: number }[];
  intervals: CoverageInterval[];
  summary: ReturnType<typeof summarizeCoverage>;
}

/** Länge der Historien-Intervalle aus den Daten ableiten (kleinster Abstand an einem Tag). */
function detectLength(rows: { date: Date; startMin: number }[]) {
  const byDay = new Map<string, number[]>();
  for (const r of rows) {
    const k = formatDateOnly(r.date);
    byDay.set(k, [...(byDay.get(k) ?? []), r.startMin]);
  }
  let min = Infinity;
  for (const starts of byDay.values()) {
    starts.sort((a, b) => a - b);
    for (let i = 1; i < starts.length; i++) {
      const d = starts[i] - starts[i - 1];
      if (d > 0 && d < min) min = d;
    }
  }
  return Number.isFinite(min) ? min : 30;
}

/** Lädt alles, was die Bedarfsberechnung braucht – unabhängig vom Wochenplan, kann also parallel dazu laufen. */
export async function loadDemandInputs(weekStart: Date) {
  const settings = await getSettings();
  const days = weekDays(weekStart);
  const historyFrom = addDaysUTC(weekStart, -7 * settings.forecastWeeks * 2);
  const [rows, holidays, serviceHours, adjustments] = await Promise.all([
    db.callHistory.findMany({
      where: { date: { gte: historyFrom, lte: addDaysUTC(days[6], -7) } },
      select: { date: true, startMin: true, offered: true, ahtSeconds: true },
    }),
    db.holiday.findMany({ where: { date: { gte: historyFrom, lte: days[6] } } }),
    db.serviceHours.findMany(),
    db.forecastAdjustment.findMany({ where: { date: { gte: days[0], lte: days[6] } } }),
  ]);
  return { settings, rows, holidays, serviceHours, adjustments };
}

export type DemandInputs = Awaited<ReturnType<typeof loadDemandInputs>>;

export async function computeWeekDemand(
  weekStart: Date,
  shifts: ShiftDTO[],
  activities: ActivityDTO[],
  preloaded?: DemandInputs,
): Promise<{ days: DayDemand[]; hasHistory: boolean }> {
  const { settings, rows, holidays, serviceHours, adjustments } = preloaded ?? (await loadDemandInputs(weekStart));
  const days = weekDays(weekStart);

  const lengthMin = detectLength(rows);
  const history: HistoryRow[] = rows.map((r) => ({
    date: formatDateOnly(r.date),
    startMin: r.startMin,
    lengthMin,
    offered: r.offered,
    ahtSeconds: r.ahtSeconds,
  }));
  const bins = toBins(history);
  const holidayByDate = new Map(holidays.map((h) => [formatDateOnly(h.date), h]));
  const excluded = new Set(holidayByDate.keys());
  const factorByDate = new Map(adjustments.map((a) => [formatDateOnly(a.date), a.factor]));
  const acts = Object.fromEntries(activities.map((a) => [a.id, a]));

  const out: DayDemand[] = days.map((day) => {
    const iso = formatDateOnly(day);
    const hol = holidayByDate.get(iso);
    const windows = hol
      ? hol.closed || hol.startMin == null || hol.endMin == null
        ? []
        : [{ startMin: hol.startMin, endMin: hol.endMin }]
      : serviceHours.filter((w) => w.weekday === isoWeekday(day)).map(({ startMin, endMin }) => ({ startMin, endMin }));

    const forecast = forecastDay(bins, iso, {
      weeks: settings.forecastWeeks,
      intervalMinutes: settings.intervalMinutes,
      excluded,
      factor: factorByDate.get(iso) ?? 1,
    });
    const intervals = computeCoverage(
      forecast,
      windows,
      shifts.filter((s) => s.date === iso),
      acts,
      settings,
    );
    return { date: iso, closed: windows.length === 0, windows, intervals, summary: summarizeCoverage(intervals) };
  });

  return { days: out, hasHistory: rows.length > 0 };
}
