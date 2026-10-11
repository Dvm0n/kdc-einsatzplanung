import type { ActivityDTO, SegmentDTO } from "./types";

export interface BreakRules {
  breakAfter6hMinutes: number;
  breakAfter9hMinutes: number;
}

export const DEFAULT_BREAK_RULES: BreakRules = { breakAfter6hMinutes: 30, breakAfter9hMinutes: 45 };

/** Erforderliche Pausenlänge für eine Schicht mit der Bruttodauer `gross` (Minuten) nach ArbZG § 4. */
export function requiredBreak(gross: number, rules: BreakRules = DEFAULT_BREAK_RULES): number {
  // mit der kurzen Pause blieben mehr als 9 h Arbeitszeit → lange Pause
  if (gross - rules.breakAfter6hMinutes > 9 * 60) return rules.breakAfter9hMinutes;
  if (gross > 6 * 60) return rules.breakAfter6hMinutes;
  return 0;
}

const round15 = (m: number) => Math.round(m / 15) * 15;

/**
 * Baut die Segmente einer Schicht: eine Hauptaktivität, bei Bedarf mit Pause etwa in der Mitte.
 */
export function buildSegments(
  startMin: number,
  endMin: number,
  activityTypeId: string,
  breakActivityId: string | null,
  rules: BreakRules = DEFAULT_BREAK_RULES,
): SegmentDTO[] {
  const gross = endMin - startMin;
  const b = breakActivityId ? requiredBreak(gross, rules) : 0;
  if (b === 0) return [{ activityTypeId, startMin, endMin }];
  const breakStart = round15(startMin + (gross - b) / 2);
  return [
    { activityTypeId, startMin, endMin: breakStart },
    { activityTypeId: breakActivityId!, startMin: breakStart, endMin: breakStart + b },
    { activityTypeId, startMin: breakStart + b, endMin },
  ];
}

/** Sortiert, schneidet auf die Schichtgrenzen zu und füllt Lücken mit der Fallback-Aktivität. */
export function normalizeSegments(
  startMin: number,
  endMin: number,
  segments: SegmentDTO[],
  fallbackActivityId: string,
): SegmentDTO[] {
  const sorted = segments
    .map((s) => ({ ...s, startMin: Math.max(s.startMin, startMin), endMin: Math.min(s.endMin, endMin) }))
    .filter((s) => s.endMin > s.startMin)
    .sort((a, b) => a.startMin - b.startMin);
  const out: SegmentDTO[] = [];
  let cursor = startMin;
  for (const s of sorted) {
    const from = Math.max(s.startMin, cursor);
    if (from > cursor) out.push({ activityTypeId: fallbackActivityId, startMin: cursor, endMin: from });
    if (s.endMin > from) out.push({ ...s, startMin: from });
    cursor = Math.max(cursor, s.endMin);
  }
  if (cursor < endMin) out.push({ activityTypeId: fallbackActivityId, startMin: cursor, endMin });
  // benachbarte gleiche Aktivitäten zusammenfassen
  return out.reduce<SegmentDTO[]>((acc, s) => {
    const last = acc[acc.length - 1];
    if (last && last.activityTypeId === s.activityTypeId && last.endMin === s.startMin) last.endMin = s.endMin;
    else acc.push({ ...s });
    return acc;
  }, []);
}

export function workMinutes(segments: SegmentDTO[], activities: Record<string, Pick<ActivityDTO, "isWorkTime">>) {
  return segments.reduce((s, seg) => s + (activities[seg.activityTypeId]?.isWorkTime ? seg.endMin - seg.startMin : 0), 0);
}

export function breakMinutes(segments: SegmentDTO[], activities: Record<string, Pick<ActivityDTO, "isBreak">>) {
  return segments.reduce((s, seg) => s + (activities[seg.activityTypeId]?.isBreak ? seg.endMin - seg.startMin : 0), 0);
}
