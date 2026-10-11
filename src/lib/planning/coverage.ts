import { grossAgents, requiredAgents, serviceLevel, trafficIntensity } from "./erlang";
import type { ForecastInterval } from "./forecast";
import type { ActivityDTO, ShiftDTO } from "./types";

export interface DemandSettings {
  intervalMinutes: number;
  serviceLevelTarget: number;
  serviceLevelSeconds: number;
  maxOccupancy: number;
  shrinkage: number;
}

export interface CoverageInterval {
  startMin: number;
  endMin: number;
  calls: number;
  ahtSeconds: number;
  /** Netto-Bedarf (Erlang C) */
  required: number;
  /** Brutto-Bedarf inkl. Shrinkage */
  requiredGross: number;
  /** Geplante Agenten am Telefon (anteilig nach Minuten) */
  planned: number;
  /** Erwartetes Service Level mit der geplanten Besetzung */
  expectedSL: number | null;
}

/** Geplante Telefon-Agenten je Intervall (Bruchteile, wenn jemand nur einen Teil des Intervalls telefoniert). */
export function plannedAgents(
  shifts: ShiftDTO[],
  activities: Record<string, Pick<ActivityDTO, "isPhoneTime">>,
  startMin: number,
  endMin: number,
): number {
  const len = endMin - startMin;
  let total = 0;
  for (const s of shifts) {
    for (const seg of s.segments) {
      if (!activities[seg.activityTypeId]?.isPhoneTime) continue;
      const overlap = Math.min(seg.endMin, endMin) - Math.max(seg.startMin, startMin);
      if (overlap > 0) total += overlap / len;
    }
  }
  return total;
}

export function isOpen(windows: { startMin: number; endMin: number }[], startMin: number, endMin: number) {
  return windows.some((w) => startMin < w.endMin && endMin > w.startMin);
}

/**
 * Bedarf und Abdeckung für einen Tag.
 * @param windows Call-Zeiten des Tages (leer = geschlossen)
 */
export function computeCoverage(
  forecast: ForecastInterval[],
  windows: { startMin: number; endMin: number }[],
  shifts: ShiftDTO[],
  activities: Record<string, Pick<ActivityDTO, "isPhoneTime">>,
  s: DemandSettings,
): CoverageInterval[] {
  if (windows.length === 0) return [];
  const iv = s.intervalMinutes;
  const from = Math.floor(Math.min(...windows.map((w) => w.startMin)) / iv) * iv;
  const to = Math.ceil(Math.max(...windows.map((w) => w.endMin)) / iv) * iv;
  const fc = new Map(forecast.map((f) => [f.startMin, f]));

  const out: CoverageInterval[] = [];
  for (let start = from; start < to; start += iv) {
    const end = start + iv;
    if (!isOpen(windows, start, end)) continue;
    const f = fc.get(start);
    const calls = f?.calls ?? 0;
    const aht = f?.ahtSeconds ?? 180;
    const staffing = requiredAgents({
      calls,
      ahtSeconds: aht,
      intervalSeconds: iv * 60,
      serviceLevelTarget: s.serviceLevelTarget,
      serviceLevelSeconds: s.serviceLevelSeconds,
      maxOccupancy: s.maxOccupancy,
    });
    // Während der Call-Zeiten mindestens eine Person am Telefon
    const required = Math.max(staffing.agents, 1);
    const planned = plannedAgents(shifts, activities, start, end);
    const traffic = trafficIntensity(calls, aht, iv * 60);
    out.push({
      startMin: start,
      endMin: end,
      calls,
      ahtSeconds: aht,
      required,
      requiredGross: grossAgents(required, s.shrinkage),
      planned,
      expectedSL: calls > 0 ? serviceLevel(Math.floor(planned + 1e-9), traffic, aht, s.serviceLevelSeconds) : null,
    });
  }
  return out;
}

export function summarizeCoverage(intervals: CoverageInterval[]) {
  const under = intervals.filter((i) => i.planned + 1e-9 < i.required);
  const over = intervals.filter((i) => i.planned >= i.required + 2);
  const calls = intervals.reduce((s, i) => s + i.calls, 0);
  const slWeighted = intervals.reduce((s, i) => s + (i.expectedSL ?? 1) * i.calls, 0);
  return {
    calls,
    underCount: under.length,
    overCount: over.length,
    worstGap: under.reduce((m, i) => Math.max(m, i.required - i.planned), 0),
    expectedSL: calls > 0 ? slWeighted / calls : null,
  };
}
