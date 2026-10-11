import { describe, expect, it } from "vitest";
import { applySuggestions, suggestOutbound } from "./overcoverage";
import { hitTest, overlaySegment, removeSegment } from "./resize";
import type { EmployeeDTO, ShiftDTO } from "./types";

const h = (x: number) => x * 60;
const emp = (id: string, skills = ["INBOUND", "OUTBOUND"]): EmployeeDTO => ({
  id,
  firstName: id,
  lastName: "",
  color: "",
  contractType: "PARTTIME",
  weeklyHours: 20,
  maxHoursPerDay: 8,
  skills,
});
const shift = (id: string, s: number, e: number): ShiftDTO => ({
  id,
  employeeId: id,
  date: "2026-10-23",
  startMin: s,
  endMin: e,
  segments: [{ activityTypeId: "in", startMin: s, endMin: e }],
});
const intervals = (req: (m: number) => number) =>
  Array.from({ length: 8 }, (_, i) => ({ startMin: h(8) + i * 30, endMin: h(8) + (i + 1) * 30, required: req(h(8) + i * 30) }));

describe("Überdeckung → Outbound", () => {
  it("stellt nur so viele um, dass der Bedarf gedeckt bleibt", () => {
    const shifts = [shift("a", h(8), h(12)), shift("b", h(8), h(12)), shift("c", h(8), h(12))];
    // 8–10 Uhr: Bedarf 1 → 2 überzählig; 10–12 Uhr: Bedarf 3 → keiner
    const s = suggestOutbound({
      shifts,
      employees: [emp("a"), emp("b"), emp("c")],
      intervals: intervals((m) => (m < h(10) ? 1 : 3)),
      inboundId: "in",
    });
    expect(s).toHaveLength(2);
    expect(s.every((x) => x.startMin === h(8) && x.endMin === h(10))).toBe(true);
  });

  it("schlägt keine Operator ohne Outbound-Skill vor", () => {
    const s = suggestOutbound({
      shifts: [shift("a", h(8), h(12)), shift("b", h(8), h(12))],
      employees: [emp("a", ["INBOUND"]), emp("b", ["INBOUND"])],
      intervals: intervals(() => 1),
      inboundId: "in",
    });
    expect(s).toEqual([]);
  });

  it("wendet mehrere Blöcke derselben Schicht korrekt an", () => {
    const shifts = [shift("a", h(8), h(12))];
    const segs = applySuggestions(
      shifts,
      [
        { shiftId: "a", employeeId: "a", startMin: h(8), endMin: h(9) },
        { shiftId: "a", employeeId: "a", startMin: h(11), endMin: h(12) },
      ],
      "out",
    ).get("a")!;
    expect(segs.map((x) => `${x.activityTypeId}${x.startMin / 60}-${x.endMin / 60}`)).toEqual(["out8-9", "in9-11", "out11-12"]);
  });
});

describe("Blöcke einfügen/entfernen", () => {
  const segs = [
    { activityTypeId: "in", startMin: h(8), endMin: h(10) },
    { activityTypeId: "br", startMin: h(10), endMin: h(10.5) },
    { activityTypeId: "in", startMin: h(10.5), endMin: h(12) },
  ];

  it("fügt einen Outbound-Block mitten in Inbound ein", () => {
    const r = overlaySegment(segs, h(11), h(12), "out");
    expect(r.at(-1)).toEqual({ activityTypeId: "out", startMin: h(11), endMin: h(12) });
    expect(r.at(-2)).toEqual({ activityTypeId: "in", startMin: h(10.5), endMin: h(11) });
  });

  it("entfernt innere Blöcke und Randblöcke", () => {
    const shape = { startMin: h(8), endMin: h(12), segments: segs };
    expect(removeSegment(shape, 1)!.segments).toEqual([{ activityTypeId: "in", startMin: h(8), endMin: h(12) }]);
    expect(removeSegment(shape, 2)!.endMin).toBe(h(10.5));
  });

  it("erkennt Greifzonen", () => {
    const shape = { startMin: h(8), endMin: h(12), segments: segs };
    // 400 px Breite → 100 px pro Stunde
    expect(hitTest(shape, 3, 400)).toEqual({ kind: "start" });
    expect(hitTest(shape, 396, 400)).toEqual({ kind: "end" });
    expect(hitTest(shape, 203, 400)).toEqual({ kind: "boundary", index: 0 });
    expect(hitTest(shape, 225, 400)).toEqual({ kind: "move", index: 1 });
    expect(hitTest(shape, 100, 400)).toEqual({ kind: "shift" });
  });
});
