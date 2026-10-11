/**
 * Vorschlag: In überdeckten Intervallen einzelne Operator von Inbound auf Outbound umstellen,
 * ohne dass die Abdeckung unter den Bedarf fällt.
 */
import { overlaySegment } from "./resize";
import type { EmployeeDTO, SegmentDTO, ShiftDTO } from "./types";

export interface OutboundSuggestion {
  shiftId: string;
  employeeId: string;
  startMin: number;
  endMin: number;
}

export function suggestOutbound(input: {
  shifts: ShiftDTO[];
  employees: EmployeeDTO[];
  intervals: { startMin: number; endMin: number; required: number }[];
  inboundId: string;
  /** kürzeste sinnvolle Outbound-Phase in Minuten (Standard 60) */
  minBlock?: number;
}): OutboundSuggestion[] {
  const { shifts, intervals, inboundId } = input;
  const minBlock = input.minBlock ?? 60;
  const canOutbound = new Set(input.employees.filter((e) => e.skills.includes("OUTBOUND")).map((e) => e.id));

  // aktuelle Inbound-Abdeckung je Intervall und wer sie stellt (nur volle Intervalle)
  const chosen = new Map<string, Set<number>>(); // shiftId → Intervall-Indizes
  let prevPicked = new Set<string>();

  intervals.forEach((iv, k) => {
    const covering = shifts.filter((s) =>
      s.segments.some((seg) => seg.activityTypeId === inboundId && seg.startMin <= iv.startMin && seg.endMin >= iv.endMin),
    );
    const partial = shifts.reduce((sum, s) => {
      let m = 0;
      for (const seg of s.segments) {
        if (seg.activityTypeId !== inboundId) continue;
        m += Math.max(0, Math.min(seg.endMin, iv.endMin) - Math.max(seg.startMin, iv.startMin));
      }
      return sum + m / (iv.endMin - iv.startMin);
    }, 0);
    const surplus = Math.floor(partial - iv.required + 1e-9);
    const picked = new Set<string>();
    if (surplus > 0) {
      const candidates = covering
        .filter((s) => canOutbound.has(s.employeeId))
        // Kontinuität: wer schon im vorigen Intervall umgestellt wurde, zuerst
        .sort((a, b) => Number(prevPicked.has(b.id)) - Number(prevPicked.has(a.id)) || a.employeeId.localeCompare(b.employeeId));
      for (const s of candidates.slice(0, surplus)) {
        picked.add(s.id);
        chosen.set(s.id, new Set([...(chosen.get(s.id) ?? []), k]));
      }
    }
    prevPicked = picked;
  });

  const out: OutboundSuggestion[] = [];
  for (const [shiftId, ks] of chosen) {
    const shift = shifts.find((s) => s.id === shiftId)!;
    // zusammenhängende Intervalle zu Blöcken zusammenfassen
    const sorted = [...ks].sort((a, b) => a - b);
    const blocks: { startMin: number; endMin: number }[] = [];
    for (const k of sorted) {
      const iv = intervals[k];
      const last = blocks[blocks.length - 1];
      if (last && last.endMin === iv.startMin) last.endMin = iv.endMin;
      else blocks.push({ startMin: iv.startMin, endMin: iv.endMin });
    }
    for (const b of blocks.filter((x) => x.endMin - x.startMin >= minBlock)) {
      out.push({ shiftId, employeeId: shift.employeeId, startMin: b.startMin, endMin: b.endMin });
    }
  }
  return out.sort((a, b) => a.startMin - b.startMin);
}

/** Wendet ausgewählte Vorschläge an: neue Segmente je Schicht. */
export function applySuggestions(
  shifts: ShiftDTO[],
  selected: OutboundSuggestion[],
  outboundId: string,
): Map<string, SegmentDTO[]> {
  const result = new Map<string, SegmentDTO[]>();
  for (const s of selected) {
    const base = result.get(s.shiftId) ?? shifts.find((x) => x.id === s.shiftId)?.segments;
    if (!base) continue;
    result.set(s.shiftId, overlaySegment(base, s.startMin, s.endMin, outboundId));
  }
  return result;
}
