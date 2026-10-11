/**
 * Automatischer Planvorschlag (Greedy-Heuristik).
 *
 * 1. Inbound: Solange es unterdeckte Intervalle gibt, wird die Schicht (Mitarbeiter × Tag × Beginn × Länge) gewählt,
 *    die am meisten fehlende Telefonzeit abdeckt – unter Beachtung von Verfügbarkeit, Abwesenheit, Vertragsstunden,
 *    Tageshöchstarbeitszeit, Ruhezeit und Skills. Pausen werden automatisch gesetzt.
 * 2. Restliche Vertragsstunden: gemischte Schichten – Inbound, wo noch Bedarf besteht, sonst Outbound
 *    (nur für Mitarbeiter mit Outbound-Skill).
 */
import { requiredBreak, type BreakRules } from "./shifts";
import type { AbsenceDTO, EmployeeDTO, SegmentDTO, ShiftDTO } from "./types";
import type { AvailabilityBlock } from "./rules";

export interface AutoDay {
  date: string;
  /** Call-Zeiten (leer = geschlossen) */
  windows: { startMin: number; endMin: number }[];
  /** Netto-Bedarf je Intervall */
  intervals: { startMin: number; endMin: number; required: number }[];
}

export interface AutoInput {
  days: AutoDay[];
  employees: EmployeeDTO[];
  existing: ShiftDTO[];
  previousShifts?: ShiftDTO[];
  absences: AbsenceDTO[];
  availability: AvailabilityBlock[];
  activityIds: { inbound: string; outbound: string | null; break: string | null };
  settings: BreakRules & { maxHoursPerDay: number; minRestHours: number; intervalMinutes: number };
  options?: { fillOutbound?: boolean; minShiftMinutes?: number; step?: number };
}

export interface ProposedShift {
  employeeId: string;
  date: string;
  startMin: number;
  endMin: number;
  segments: SegmentDTO[];
}

export interface AutoResult {
  shifts: ProposedShift[];
  stats: { inboundShifts: number; mixedShifts: number; remainingDeficitHours: number };
}

interface Candidate {
  emp: EmployeeDTO;
  day: AutoDay;
  dayIdx: number;
  start: number;
  end: number;
  work: number;
  score: number;
  gain: number;
}

const EPS = 1e-9;

export function autoSchedule(input: AutoInput): AutoResult {
  const { days, employees, settings } = input;
  const minShift = input.options?.minShiftMinutes ?? 180;
  const step = input.options?.step ?? 30;
  const iv = settings.intervalMinutes;

  // geplante Telefonzeit je Tag/Intervall (Bruchteile)
  const planned = days.map((d) =>
    d.intervals.map((i) => {
      let p = 0;
      for (const s of input.existing.filter((x) => x.date === d.date)) {
        for (const seg of s.segments) {
          if (seg.activityTypeId !== input.activityIds.inbound) continue;
          const o = Math.min(seg.endMin, i.endMin) - Math.max(seg.startMin, i.startMin);
          if (o > 0) p += o / (i.endMin - i.startMin);
        }
      }
      return p;
    }),
  );

  // belegte Tage und Arbeitsminuten je Mitarbeiter
  const shiftsByEmp = new Map<string, { date: string; startMin: number; endMin: number }[]>();
  const workByEmp = new Map<string, number>();
  for (const s of [...(input.previousShifts ?? []), ...input.existing]) {
    shiftsByEmp.set(s.employeeId, [...(shiftsByEmp.get(s.employeeId) ?? []), s]);
  }
  for (const s of input.existing) {
    const brk = s.segments.filter((x) => x.activityTypeId === input.activityIds.break).reduce((a, x) => a + x.endMin - x.startMin, 0);
    workByEmp.set(s.employeeId, (workByEmp.get(s.employeeId) ?? 0) + s.endMin - s.startMin - brk);
  }

  const result: ProposedShift[] = [];

  const dayAbs = (d: string) => Date.parse(d + "T00:00:00Z") / 60000;

  function feasible(
    emp: EmployeeDTO,
    day: AutoDay,
    start: number,
    end: number,
    work: number,
    extending = false,
  ): { ok: boolean; preferred: boolean } {
    const no = { ok: false, preferred: false };
    if (day.windows.length === 0) return no;
    const own = (shiftsByEmp.get(emp.id) ?? []).filter((s) => !(extending && s.date === day.date));
    if (own.some((s) => s.date === day.date)) return no;
    if (input.absences.some((a) => a.employeeId === emp.id && a.startDate <= day.date && a.endDate >= day.date)) return no;

    const maxDay = Math.min(emp.maxHoursPerDay, settings.maxHoursPerDay) * 60;
    if (work > maxDay + EPS) return no;
    const remaining = emp.weeklyHours * 60 - (workByEmp.get(emp.id) ?? 0);
    if (work > remaining + 15) return no;

    // Ruhezeit zu Schichten an anderen Tagen
    const absStart = dayAbs(day.date) + start;
    const absEnd = dayAbs(day.date) + end;
    const rest = settings.minRestHours * 60;
    for (const s of own) {
      const sStart = dayAbs(s.date) + s.startMin;
      const sEnd = dayAbs(s.date) + s.endMin;
      if (sEnd <= absStart && absStart - sEnd < rest) return no;
      if (absEnd <= sStart && sStart - absEnd < rest) return no;
    }

    // Verfügbarkeit
    const blocks = input.availability.filter((a) => a.employeeId === emp.id && a.date === day.date);
    if (blocks.some((b) => b.kind === "UNAVAILABLE" && b.startMin < end && b.endMin > start)) return no;
    const positive = blocks.filter((b) => b.kind !== "UNAVAILABLE");
    if (positive.length > 0) {
      const inside = positive.some((b) => b.startMin <= start && b.endMin >= end);
      if (!inside) return no;
      return { ok: true, preferred: positive.some((b) => b.kind === "PREFERRED" && b.startMin <= start && b.endMin >= end) };
    }
    return { ok: true, preferred: false };
  }

  /** Telefon-Anteil je Intervall, wenn die Schicht [start,end) mit Pause in der Mitte gearbeitet wird. */
  function phoneProfile(day: AutoDay, start: number, end: number) {
    const b = requiredBreak(end - start, settings);
    const bs = b ? Math.round((start + (end - start - b) / 2) / 15) * 15 : -1;
    return day.intervals.map((i) => {
      let m = Math.max(0, Math.min(end, i.endMin) - Math.max(start, i.startMin));
      if (b) m -= Math.max(0, Math.min(bs + b, i.endMin) - Math.max(bs, i.startMin));
      return m / (i.endMin - i.startMin);
    });
  }

  function openRange(day: AutoDay) {
    return {
      from: Math.min(...day.windows.map((w) => w.startMin)),
      to: Math.max(...day.windows.map((w) => w.endMin)),
    };
  }

  function bestCandidate(mode: "inbound" | "mixed", emp?: EmployeeDTO): Candidate | null {
    let best: Candidate | null = null;
    const emps = emp ? [emp] : employees.filter((e) => e.skills.includes("INBOUND"));
    for (const e of emps) {
      const remaining = e.weeklyHours * 60 - (workByEmp.get(e.id) ?? 0);
      if (remaining < minShift - 15) continue;
      days.forEach((day, dayIdx) => {
        if (day.windows.length === 0) return;
        const { from, to } = openRange(day);
        const maxDay = Math.min(e.maxHoursPerDay, settings.maxHoursPerDay) * 60;
        for (let start = from; start + minShift <= to; start += step) {
          for (let len = minShift; start + len <= to; len += step) {
            const brk = requiredBreak(len, settings);
            const work = len - brk;
            if (work > maxDay || work > remaining + 15) break;
            if (mode === "mixed" && len < Math.min(remaining, maxDay) - step && start + len + step <= to) continue;
            const f = feasible(e, day, start, start + len, work);
            if (!f.ok) continue;
            const prof = phoneProfile(day, start, start + len);
            let gain = 0;
            day.intervals.forEach((i, k) => {
              const deficit = i.required - planned[dayIdx][k];
              if (deficit > EPS) gain += Math.min(deficit, prof[k]) * ((i.endMin - i.startMin) / 60);
            });
            const workH = work / 60;
            const fairness = remaining / Math.max(60, e.weeklyHours * 60);
            const score =
              mode === "inbound"
                ? gain - 0.2 * Math.max(0, workH - gain) + (f.preferred ? 0.5 : 0) + 0.1 * fairness
                : workH + 3 * gain + (f.preferred ? 0.5 : 0);
            if (!best || score > best.score + EPS) {
              best = { emp: e, day, dayIdx, start, end: start + len, work, score, gain };
            }
          }
        }
      });
    }
    return best;
  }

  function coverageOf(day: AutoDay, segs: SegmentDTO[]) {
    return day.intervals.map((i) => {
      let m = 0;
      for (const s of segs) {
        if (s.activityTypeId !== input.activityIds.inbound) continue;
        m += Math.max(0, Math.min(s.endMin, i.endMin) - Math.max(s.startMin, i.startMin));
      }
      return m / (i.endMin - i.startMin);
    });
  }

  /** Nimmt eine vorgeschlagene Schicht wieder heraus (für Verlängerungen). */
  function uncommit(idx: number) {
    const s = result[idx];
    const dayIdx = days.findIndex((d) => d.date === s.date);
    coverageOf(days[dayIdx], s.segments).forEach((v, k) => (planned[dayIdx][k] -= v));
    const work = s.segments.filter((x) => x.activityTypeId !== input.activityIds.break).reduce((a, x) => a + x.endMin - x.startMin, 0);
    workByEmp.set(s.employeeId, (workByEmp.get(s.employeeId) ?? 0) - work);
    shiftsByEmp.set(
      s.employeeId,
      (shiftsByEmp.get(s.employeeId) ?? []).filter((x) => !(x.date === s.date && x.startMin === s.startMin)),
    );
    result.splice(idx, 1);
    return { shift: s, dayIdx, work };
  }

  function restore(s: ProposedShift, dayIdx: number, work: number) {
    coverageOf(days[dayIdx], s.segments).forEach((v, k) => (planned[dayIdx][k] += v));
    workByEmp.set(s.employeeId, (workByEmp.get(s.employeeId) ?? 0) + work);
    shiftsByEmp.set(s.employeeId, [...(shiftsByEmp.get(s.employeeId) ?? []), s]);
    result.push(s);
  }

  /**
   * Verlängert vorgeschlagene Schichten, wenn das Bedarf deckt ("inbound") bzw. Vertragsstunden füllt ("mixed").
   * Gibt true zurück, wenn eine Verlängerung übernommen wurde.
   */
  function extendOnce(mode: "inbound" | "mixed"): boolean {
    let best: { idx: number; c: Candidate; improvement: number } | null = null;
    for (let idx = 0; idx < result.length; idx++) {
      const s = result[idx];
      const e = employees.find((x) => x.id === s.employeeId)!;
      if (mode === "mixed" && !e.skills.includes("OUTBOUND")) continue;
      const { shift, dayIdx, work: oldWork } = uncommit(idx);
      const day = days[dayIdx];
      const oldGain = day.intervals.reduce((sum, i, k) => {
        const cov = coverageOf(day, shift.segments)[k];
        const deficit = i.required - planned[dayIdx][k];
        return sum + (deficit > EPS ? Math.min(deficit, cov) * ((i.endMin - i.startMin) / 60) : 0);
      }, 0);
      const { from, to } = openRange(day);
      const maxDay = Math.min(e.maxHoursPerDay, settings.maxHoursPerDay) * 60;
      const remaining = e.weeklyHours * 60 - (workByEmp.get(e.id) ?? 0);
      for (let start = shift.startMin; start >= from; start -= step) {
        for (let end = shift.endMin; end <= to; end += step) {
          if (start === shift.startMin && end === shift.endMin) continue;
          const len = end - start;
          const work = len - requiredBreak(len, settings);
          if (work > maxDay || work > remaining + 15) break;
          if (!feasible(e, day, start, end, work, true).ok) continue;
          const prof = phoneProfile(day, start, end);
          const gain = day.intervals.reduce((sum, i, k) => {
            const deficit = i.required - planned[dayIdx][k];
            return sum + (deficit > EPS ? Math.min(deficit, prof[k]) * ((i.endMin - i.startMin) / 60) : 0);
          }, 0);
          const extraH = (work - oldWork) / 60;
          const improvement = mode === "inbound" ? gain - oldGain - 0.2 * Math.max(0, extraH - (gain - oldGain)) : extraH + 3 * (gain - oldGain);
          if (improvement > (best?.improvement ?? (mode === "inbound" ? 0.25 : 0.4))) {
            best = { idx, c: { emp: e, day, dayIdx, start, end, work, score: improvement, gain }, improvement };
          }
        }
      }
      restore(shift, dayIdx, oldWork);
      // restore() hängt hinten an – Reihenfolge ist egal, Index aber nicht: Schleife neu ausrichten
      result.splice(idx, 0, result.pop()!);
    }
    if (!best) return false;
    uncommit(best.idx);
    commit(best.c, mode);
    return true;
  }

  function commit(c: Candidate, mode: "inbound" | "mixed") {
    // Segmente: Inbound, wo Bedarf besteht (bei "mixed"), sonst Outbound; Pause in der Mitte
    const perInterval: SegmentDTO[] = [];
    const mainOther = input.activityIds.outbound ?? input.activityIds.inbound;
    for (let m = c.start; m < c.end; m += iv) {
      const k = c.day.intervals.findIndex((i) => i.startMin <= m && i.endMin > m);
      const deficit = k >= 0 ? c.day.intervals[k].required - planned[c.dayIdx][k] : 0;
      const act = mode === "inbound" || deficit > EPS ? input.activityIds.inbound : mainOther;
      perInterval.push({ activityTypeId: act, startMin: m, endMin: Math.min(m + iv, c.end) });
    }
    let segs = mergeSegments(perInterval);
    const b = requiredBreak(c.end - c.start, settings);
    if (b && input.activityIds.break) {
      const bs = Math.round((c.start + (c.end - c.start - b) / 2) / 15) * 15;
      segs = insertBreak(segs, bs, bs + b, input.activityIds.break);
    }
    // Abdeckung aktualisieren (nur Inbound-Segmente)
    coverageOf(c.day, segs).forEach((v, k) => (planned[c.dayIdx][k] += v));
    shiftsByEmp.set(c.emp.id, [...(shiftsByEmp.get(c.emp.id) ?? []), { date: c.day.date, startMin: c.start, endMin: c.end }]);
    workByEmp.set(c.emp.id, (workByEmp.get(c.emp.id) ?? 0) + c.work);
    result.push({ employeeId: c.emp.id, date: c.day.date, startMin: c.start, endMin: c.end, segments: segs });
  }

  // Phase 1: Inbound-Bedarf decken
  let inboundShifts = 0;
  for (let guard = 0; guard < 500; guard++) {
    const c = bestCandidate("inbound");
    if (!c || c.gain < 0.5) break;
    commit(c, "inbound");
    inboundShifts++;
  }
  // Restlücken durch Verlängern vorhandener Vorschläge schließen
  for (let guard = 0; guard < 200 && extendOnce("inbound"); guard++);

  // Phase 2: restliche Vertragsstunden mit gemischten Inbound/Outbound-Schichten füllen
  let mixedShifts = 0;
  if (input.options?.fillOutbound !== false && input.activityIds.outbound) {
    for (const e of employees.filter((x) => x.skills.includes("OUTBOUND"))) {
      for (let guard = 0; guard < 7; guard++) {
        const c = bestCandidate("mixed", e);
        if (!c) break;
        commit(c, "mixed");
        mixedShifts++;
      }
    }
    for (let guard = 0; guard < 200 && extendOnce("mixed"); guard++);
  }

  // Phase 3: Pausen staffeln – jede Pause dorthin legen, wo sie die Abdeckung am wenigsten schwächt
  if (input.activityIds.break) {
    const breakId = input.activityIds.break;
    for (let pass = 0; pass < 2; pass++) {
      for (const s of result) {
        const brkSeg = s.segments.find((x) => x.activityTypeId === breakId);
        if (!brkSeg) continue;
        const b = brkSeg.endMin - brkSeg.startMin;
        const dayIdx = days.findIndex((d) => d.date === s.date);
        const day = days[dayIdx];
        coverageOf(day, s.segments).forEach((v, k) => (planned[dayIdx][k] -= v));
        const base = removeBreak(s.segments, breakId);
        const mid = Math.round((s.startMin + (s.endMin - s.startMin - b) / 2) / 15) * 15;
        let bestSegs = s.segments;
        let bestCost = Infinity;
        for (let bs = s.startMin + 120; bs + b <= s.endMin - 60; bs += 15) {
          // max. 6 h Arbeit am Stück (ArbZG § 4)
          if (bs - s.startMin > 360 || s.endMin - (bs + b) > 360) continue;
          const segs = insertBreak(base, bs, bs + b, breakId);
          const cov = coverageOf(day, segs);
          const cost =
            day.intervals.reduce((sum, i, k) => sum + Math.max(0, i.required - planned[dayIdx][k] - cov[k]), 0) +
            Math.abs(bs - mid) / 10_000;
          if (cost < bestCost - EPS) {
            bestCost = cost;
            bestSegs = segs;
          }
        }
        s.segments = bestSegs;
        coverageOf(day, s.segments).forEach((v, k) => (planned[dayIdx][k] += v));
      }
    }
  }

  const remainingDeficitHours = days.reduce(
    (sum, d, di) =>
      sum + d.intervals.reduce((s, i, k) => s + Math.max(0, i.required - planned[di][k]) * ((i.endMin - i.startMin) / 60), 0),
    0,
  );

  return { shifts: result, stats: { inboundShifts, mixedShifts, remainingDeficitHours } };
}

function mergeSegments(segs: SegmentDTO[]): SegmentDTO[] {
  return segs.reduce<SegmentDTO[]>((acc, s) => {
    const last = acc[acc.length - 1];
    if (last && last.activityTypeId === s.activityTypeId && last.endMin === s.startMin) last.endMin = s.endMin;
    else acc.push({ ...s });
    return acc;
  }, []);
}

/** Ersetzt die Pause durch die Aktivität davor (bzw. danach). */
function removeBreak(segs: SegmentDTO[], breakId: string): SegmentDTO[] {
  const out = segs.map((s, i) => {
    if (s.activityTypeId !== breakId) return { ...s };
    const neighbour = segs[i - 1] ?? segs[i + 1];
    return { ...s, activityTypeId: neighbour?.activityTypeId ?? s.activityTypeId };
  });
  return mergeSegments(out);
}

function insertBreak(segs: SegmentDTO[], from: number, to: number, breakId: string): SegmentDTO[] {
  const out: SegmentDTO[] = [];
  for (const s of segs) {
    if (s.endMin <= from || s.startMin >= to) {
      out.push(s);
      continue;
    }
    if (s.startMin < from) out.push({ ...s, endMin: from });
    if (s.endMin > to) out.push({ ...s, startMin: to });
  }
  out.push({ activityTypeId: breakId, startMin: from, endMin: to });
  return mergeSegments(out.sort((a, b) => a.startMin - b.startMin));
}
