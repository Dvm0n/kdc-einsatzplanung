import type { SegmentDTO } from "./types";

/**
 * Greifpunkte einer Schicht in der Tagesansicht:
 * - start / end: Schichtbeginn bzw. -ende (äußere Ränder)
 * - boundary: Grenze zwischen Segment `index` und `index + 1`
 * - move: inneres Segment (z. B. Pause) als Ganzes verschieben
 */
export type DragHandle =
  | { kind: "start" }
  | { kind: "end" }
  | { kind: "boundary"; index: number }
  | { kind: "move"; index: number }
  | { kind: "shift" };

export interface ShiftShape {
  startMin: number;
  endMin: number;
  segments: SegmentDTO[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * Wendet eine Ziehbewegung um `delta` Minuten an. Jedes Segment bleibt mindestens `minLen` lang,
 * die Schicht bleibt innerhalb von `bounds`.
 */
export function applyDrag(
  shape: ShiftShape,
  handle: DragHandle,
  delta: number,
  bounds: { min: number; max: number },
  minLen = 15,
): ShiftShape {
  const segs = shape.segments.map((s) => ({ ...s }));
  if (segs.length === 0) return shape;
  const last = segs.length - 1;

  switch (handle.kind) {
    case "start": {
      const v = clamp(segs[0].startMin + delta, bounds.min, segs[0].endMin - minLen);
      segs[0].startMin = v;
      return { startMin: v, endMin: shape.endMin, segments: segs };
    }
    case "end": {
      const v = clamp(segs[last].endMin + delta, segs[last].startMin + minLen, bounds.max);
      segs[last].endMin = v;
      return { startMin: shape.startMin, endMin: v, segments: segs };
    }
    case "boundary": {
      const a = segs[handle.index];
      const b = segs[handle.index + 1];
      if (!a || !b) return shape;
      const v = clamp(a.endMin + delta, a.startMin + minLen, b.endMin - minLen);
      a.endMin = v;
      b.startMin = v;
      return { ...shape, segments: segs };
    }
    case "move": {
      const i = handle.index;
      if (i <= 0 || i >= last) return shape;
      const prev = segs[i - 1];
      const cur = segs[i];
      const next = segs[i + 1];
      const d = clamp(delta, prev.startMin + minLen - cur.startMin, next.endMin - minLen - cur.endMin);
      prev.endMin += d;
      cur.startMin += d;
      cur.endMin += d;
      next.startMin += d;
      return { ...shape, segments: segs };
    }
    case "shift": {
      // ganze Schicht zeitlich verschieben
      const d = clamp(delta, bounds.min - shape.startMin, bounds.max - shape.endMin);
      return {
        startMin: shape.startMin + d,
        endMin: shape.endMin + d,
        segments: segs.map((s) => ({ ...s, startMin: s.startMin + d, endMin: s.endMin + d })),
      };
    }
  }
}

/**
 * Ermittelt, welcher Greifpunkt an Position `x` (Pixel ab linkem Rand der Schicht, Breite `width`) liegt.
 * Ränder und Segmentgrenzen haben eine Greifzone von `zone` Pixeln.
 */
export function hitTest(shape: ShiftShape, x: number, width: number, zone = 8): DragHandle {
  const len = shape.endMin - shape.startMin || 1;
  const toX = (m: number) => ((m - shape.startMin) / len) * width;
  const edge = Math.min(zone, width / 4);
  if (x <= edge) return { kind: "start" };
  if (x >= width - edge) return { kind: "end" };
  for (let i = 0; i < shape.segments.length - 1; i++) {
    if (Math.abs(x - toX(shape.segments[i].endMin)) <= Math.min(zone, 6)) return { kind: "boundary", index: i };
  }
  const idx = shape.segments.findIndex((s) => x >= toX(s.startMin) && x < toX(s.endMin));
  if (idx > 0 && idx < shape.segments.length - 1) return { kind: "move", index: idx };
  return { kind: "shift" };
}

/** Fügt einen Block [from, to) mit Aktivität `activityId` in die Segmente ein (überschreibt dort Vorhandenes). */
export function overlaySegment(segments: SegmentDTO[], from: number, to: number, activityId: string): SegmentDTO[] {
  const out: SegmentDTO[] = [];
  for (const s of segments) {
    if (s.endMin <= from || s.startMin >= to) {
      out.push({ ...s });
      continue;
    }
    if (s.startMin < from) out.push({ ...s, endMin: from });
    if (s.endMin > to) out.push({ ...s, startMin: to });
  }
  out.push({ activityTypeId: activityId, startMin: from, endMin: to });
  return mergeAdjacent(out.sort((a, b) => a.startMin - b.startMin));
}

/** Entfernt Segment `index`: am Rand wird die Schicht kürzer, innen übernimmt das vorherige Segment die Zeit. */
export function removeSegment(shape: ShiftShape, index: number): ShiftShape | null {
  const segs = shape.segments.map((s) => ({ ...s }));
  if (segs.length <= 1) return null;
  if (index === 0) {
    segs.shift();
    return { startMin: segs[0].startMin, endMin: shape.endMin, segments: segs };
  }
  if (index === segs.length - 1) {
    segs.pop();
    return { startMin: shape.startMin, endMin: segs[segs.length - 1].endMin, segments: segs };
  }
  segs[index - 1].endMin = segs[index].endMin;
  segs.splice(index, 1);
  return { ...shape, segments: mergeAdjacent(segs) };
}

export function mergeAdjacent(segs: SegmentDTO[]): SegmentDTO[] {
  return segs.reduce<SegmentDTO[]>((acc, s) => {
    const last = acc[acc.length - 1];
    if (last && last.activityTypeId === s.activityTypeId && last.endMin === s.startMin) last.endMin = s.endMin;
    else acc.push({ ...s });
    return acc;
  }, []);
}

/** Snap auf ein Raster (Standard 15 Minuten) */
export function snap(minutes: number, step = 15) {
  return Math.round(minutes / step) * step;
}
