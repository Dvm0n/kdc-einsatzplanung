/**
 * Faire Verteilung von Randzeiten: Wer übernimmt wie oft die Früh- bzw. Spätschicht
 * (Schicht deckt die erste bzw. letzte Stunde der Call-Zeiten ab)?
 */
import type { ServiceWindow, ShiftDTO } from "./types";

export interface EdgeCounts {
  early: number;
  late: number;
  shifts: number;
}

/** Erste/letzte Stunde der Call-Zeiten an einem Wochentag; null = geschlossen */
export function edgeHours(windows: ServiceWindow[], weekday: number) {
  const day = windows.filter((w) => w.weekday === weekday);
  if (day.length === 0) return null;
  const open = Math.min(...day.map((w) => w.startMin));
  const close = Math.max(...day.map((w) => w.endMin));
  return { early: [open, Math.min(open + 60, close)] as const, late: [Math.max(close - 60, open), close] as const };
}

function isoWeekday(iso: string) {
  const d = new Date(iso + "T00:00:00Z").getUTCDay();
  return d === 0 ? 7 : d;
}

export function classifyShift(s: { date: string; startMin: number; endMin: number }, windows: ServiceWindow[]) {
  const e = edgeHours(windows, isoWeekday(s.date));
  if (!e) return { early: false, late: false };
  // Randzeit = mindestens die halbe erste/letzte Stunde abgedeckt
  const overlap = (a: readonly [number, number]) => Math.min(s.endMin, a[1]) - Math.max(s.startMin, a[0]);
  return { early: overlap(e.early) >= 30, late: overlap(e.late) >= 30 };
}

export function edgeCounts(shifts: Pick<ShiftDTO, "employeeId" | "date" | "startMin" | "endMin">[], windows: ServiceWindow[]) {
  const out = new Map<string, EdgeCounts>();
  for (const s of shifts) {
    const c = out.get(s.employeeId) ?? { early: 0, late: 0, shifts: 0 };
    const k = classifyShift(s, windows);
    c.shifts++;
    if (k.early) c.early++;
    if (k.late) c.late++;
    out.set(s.employeeId, c);
  }
  return out;
}

/**
 * Wie stark ist jemand im Vergleich zum Team mit Randzeiten belastet?
 * > 0: mehr als der Durchschnitt (pro Schicht), < 0: weniger.
 */
export function edgeLoad(counts: Map<string, EdgeCounts>) {
  const rate = (c: EdgeCounts) => (c.shifts ? (c.early + c.late) / c.shifts : 0);
  const all = [...counts.values()].filter((c) => c.shifts > 0);
  const avg = all.length ? all.reduce((s, c) => s + rate(c), 0) / all.length : 0;
  return new Map([...counts.entries()].map(([id, c]) => [id, c.shifts ? rate(c) - avg : 0]));
}
