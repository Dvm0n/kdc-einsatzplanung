/**
 * „Was hat sich geändert?“ – Vergleich des Stands bei Veröffentlichung mit dem aktuellen Plan.
 */
import type { SegmentDTO, ShiftDTO } from "./types";

export interface SnapshotShift {
  id: string;
  employeeId: string;
  date: string;
  startMin: number;
  endMin: number;
  segments: SegmentDTO[];
}

export type ChangeKind = "new" | "changed" | "removed";

export interface ShiftChange {
  kind: ChangeKind;
  employeeId: string;
  date: string;
  shiftId: string;
  before: { startMin: number; endMin: number; segments: SegmentDTO[] } | null;
  after: { startMin: number; endMin: number; segments: SegmentDTO[] } | null;
}

export function toSnapshot(shifts: ShiftDTO[]): SnapshotShift[] {
  return shifts.map(({ id, employeeId, date, startMin, endMin, segments }) => ({
    id,
    employeeId,
    date,
    startMin,
    endMin,
    segments: segments.map(({ activityTypeId, startMin: s, endMin: e }) => ({ activityTypeId, startMin: s, endMin: e })),
  }));
}

function sameSegments(a: SegmentDTO[], b: SegmentDTO[]) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x.startMin - y.startMin);
  const sb = [...b].sort((x, y) => x.startMin - y.startMin);
  return sa.every(
    (s, i) => s.activityTypeId === sb[i].activityTypeId && s.startMin === sb[i].startMin && s.endMin === sb[i].endMin,
  );
}

/**
 * Liefert alle Änderungen seit dem Snapshot. Wechselt eine Schicht den Mitarbeiter (Tausch/Börse),
 * erscheint sie beim alten Besitzer als „removed“ und beim neuen als „new“.
 */
export function diffShifts(snapshot: SnapshotShift[], current: ShiftDTO[]): ShiftChange[] {
  const before = new Map(snapshot.map((s) => [s.id, s]));
  const after = new Map(current.map((s) => [s.id, s]));
  const out: ShiftChange[] = [];
  const shape = (s: { startMin: number; endMin: number; segments: SegmentDTO[] }) => ({
    startMin: s.startMin,
    endMin: s.endMin,
    segments: s.segments,
  });

  for (const s of current) {
    const b = before.get(s.id);
    if (!b || b.employeeId !== s.employeeId) {
      out.push({ kind: "new", employeeId: s.employeeId, date: s.date, shiftId: s.id, before: null, after: shape(s) });
    } else if (b.date !== s.date || b.startMin !== s.startMin || b.endMin !== s.endMin || !sameSegments(b.segments, s.segments)) {
      out.push({ kind: "changed", employeeId: s.employeeId, date: s.date, shiftId: s.id, before: shape(b), after: shape(s) });
    }
  }
  for (const b of snapshot) {
    const a = after.get(b.id);
    if (!a || a.employeeId !== b.employeeId) {
      out.push({ kind: "removed", employeeId: b.employeeId, date: b.date, shiftId: b.id, before: shape(b), after: null });
    }
  }
  return out.sort((x, y) => x.date.localeCompare(y.date) || (x.after ?? x.before)!.startMin - (y.after ?? y.before)!.startMin);
}
