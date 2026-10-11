/**
 * Anrufprognose aus der Historie: gewichteter Durchschnitt der letzten N gleichen Wochentage
 * (neuere Wochen zählen stärker), je Intervall.
 */

export interface HistoryRow {
  /** YYYY-MM-DD */
  date: string;
  startMin: number;
  /** Länge des Historien-Intervalls in Minuten (z. B. 30) */
  lengthMin: number;
  offered: number;
  ahtSeconds: number;
}

export interface ForecastInterval {
  startMin: number;
  calls: number;
  ahtSeconds: number;
}

const BIN = 15;

function isoWeekday(iso: string) {
  const d = new Date(iso + "T00:00:00Z").getUTCDay();
  return d === 0 ? 7 : d;
}

function addDays(iso: string, n: number) {
  return new Date(Date.parse(iso + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
}

/** Verteilt Historienzeilen gleichmäßig auf 15-Minuten-Bins: Map<date, Map<binStart, {calls, talkSec}>> */
export function toBins(rows: HistoryRow[]) {
  const out = new Map<string, Map<number, { calls: number; talk: number }>>();
  for (const r of rows) {
    const n = Math.max(1, Math.round(r.lengthMin / BIN));
    const day = out.get(r.date) ?? new Map();
    for (let i = 0; i < n; i++) {
      const start = r.startMin + i * BIN;
      const b = day.get(start) ?? { calls: 0, talk: 0 };
      b.calls += r.offered / n;
      b.talk += (r.offered / n) * r.ahtSeconds;
      day.set(start, b);
    }
    out.set(r.date, day);
  }
  return out;
}

/**
 * Prognose für ein Datum.
 * @param weeks Anzahl der zu berücksichtigenden Vorwochen
 * @param excluded Daten, die nicht in die Historie einfließen (Feiertage, Ausreißer)
 */
export function forecastDay(
  bins: ReturnType<typeof toBins>,
  date: string,
  opts: { weeks: number; intervalMinutes: number; excluded?: Set<string>; factor?: number; defaultAht?: number },
): ForecastInterval[] {
  const { weeks, intervalMinutes } = opts;
  const samples: { weight: number; day: Map<number, { calls: number; talk: number }> }[] = [];
  // bis zu doppelt so weit zurückschauen, falls Tage ausgeschlossen sind oder fehlen
  for (let k = 1; k <= weeks * 2 && samples.length < weeks; k++) {
    const d = addDays(date, -7 * k);
    if (opts.excluded?.has(d)) continue;
    const day = bins.get(d);
    if (!day) continue;
    samples.push({ weight: 0, day });
  }
  if (samples.length === 0) return [];
  // lineare Gewichtung: jüngste Woche = n, älteste = 1
  samples.forEach((s, i) => (s.weight = samples.length - i));
  const totalWeight = samples.reduce((s, x) => s + x.weight, 0);

  const starts = new Set<number>();
  for (const s of samples) for (const k of s.day.keys()) starts.add(Math.floor(k / intervalMinutes) * intervalMinutes);

  const factor = opts.factor ?? 1;
  const result: ForecastInterval[] = [];
  for (const start of [...starts].sort((a, b) => a - b)) {
    let calls = 0;
    let talk = 0;
    for (const s of samples) {
      for (let m = start; m < start + intervalMinutes; m += BIN) {
        const b = s.day.get(m);
        if (!b) continue;
        calls += (b.calls * s.weight) / totalWeight;
        talk += (b.talk * s.weight) / totalWeight;
      }
    }
    result.push({
      startMin: start,
      calls: calls * factor,
      ahtSeconds: calls > 0 ? talk / calls : (opts.defaultAht ?? 180),
    });
  }
  return result;
}

export { isoWeekday as forecastWeekday };
