import { describe, expect, it } from "vitest";
import { applyDrag, snap, type ShiftShape } from "./resize";

const h = (x: number) => x * 60;
const shape: ShiftShape = {
  startMin: h(8),
  endMin: h(15),
  segments: [
    { activityTypeId: "in", startMin: h(8), endMin: h(11) },
    { activityTypeId: "br", startMin: h(11), endMin: h(11.5) },
    { activityTypeId: "out", startMin: h(11.5), endMin: h(15) },
  ],
};
const bounds = { min: h(7), max: h(19) };

describe("Ziehen in der Tagesansicht", () => {
  it("verlängert das Schichtende", () => {
    const r = applyDrag(shape, { kind: "end" }, 60, bounds);
    expect(r.endMin).toBe(h(16));
    expect(r.segments[2].endMin).toBe(h(16));
  });

  it("verschiebt den Schichtbeginn, aber nicht über die Grenzen", () => {
    expect(applyDrag(shape, { kind: "start" }, -180, bounds).startMin).toBe(h(7));
    // höchstens bis 15 min vor Ende des ersten Segments
    expect(applyDrag(shape, { kind: "start" }, 600, bounds).startMin).toBe(h(11) - 15);
  });

  it("verschiebt die Grenze zwischen zwei Segmenten", () => {
    const r = applyDrag(shape, { kind: "boundary", index: 1 }, 30, bounds);
    expect(r.segments[1]).toMatchObject({ startMin: h(11), endMin: h(12) });
    expect(r.segments[2].startMin).toBe(h(12));
    expect(r.startMin).toBe(h(8));
    expect(r.endMin).toBe(h(15));
  });

  it("verschiebt eine Pause als Ganzes", () => {
    const r = applyDrag(shape, { kind: "move", index: 1 }, 60, bounds);
    expect(r.segments.map((s) => [s.startMin / 60, s.endMin / 60])).toEqual([
      [8, 12],
      [12, 12.5],
      [12.5, 15],
    ]);
    // Nachbarn bleiben mindestens 15 min lang
    const far = applyDrag(shape, { kind: "move", index: 1 }, 600, bounds);
    expect(far.segments[2].endMin - far.segments[2].startMin).toBe(15);
  });

  it("rastet auf 15 Minuten ein", () => {
    expect(snap(22)).toBe(15);
    expect(snap(23)).toBe(30);
    expect(snap(-8)).toBe(-15);
  });
});
