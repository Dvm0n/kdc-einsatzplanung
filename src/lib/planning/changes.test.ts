import { describe, expect, it } from "vitest";
import { diffShifts, toSnapshot } from "./changes";
import { classifyShift, edgeCounts, edgeLoad } from "./fairness";
import type { ShiftDTO } from "./types";

const h = (x: number) => x * 60;
const shift = (id: string, emp: string, date: string, s: number, e: number): ShiftDTO => ({
  id,
  employeeId: emp,
  date,
  startMin: s,
  endMin: e,
  segments: [{ activityTypeId: "in", startMin: s, endMin: e }],
});

describe("Was hat sich geändert?", () => {
  const published = [shift("a", "anna", "2026-10-12", h(8), h(12)), shift("b", "tim", "2026-10-12", h(13), h(18))];
  const snap = toSnapshot(published);

  it("erkennt keine Änderung bei gleichem Stand", () => {
    expect(diffShifts(snap, published)).toEqual([]);
  });

  it("erkennt neue, geänderte und gestrichene Schichten", () => {
    const now = [shift("a", "anna", "2026-10-12", h(8), h(13)), shift("c", "lea", "2026-10-13", h(8), h(12))];
    const d = diffShifts(snap, now);
    expect(d.map((x) => `${x.kind}:${x.employeeId}`).sort()).toEqual(["changed:anna", "new:lea", "removed:tim"]);
    expect(d.find((x) => x.kind === "changed")!.before!.endMin).toBe(h(12));
  });

  it("zeigt einen Besitzerwechsel bei beiden Personen", () => {
    const d = diffShifts(snap, [published[0], { ...published[1], employeeId: "murat" }]);
    expect(d.map((x) => `${x.kind}:${x.employeeId}`).sort()).toEqual(["new:murat", "removed:tim"]);
  });
});

describe("Faire Verteilung", () => {
  const windows = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMin: h(8), endMin: h(18) }));

  it("erkennt Früh- und Spätschichten", () => {
    expect(classifyShift({ date: "2026-10-12", startMin: h(8), endMin: h(12) }, windows)).toEqual({ early: true, late: false });
    expect(classifyShift({ date: "2026-10-12", startMin: h(14), endMin: h(18) }, windows)).toEqual({ early: false, late: true });
    expect(classifyShift({ date: "2026-10-12", startMin: h(10), endMin: h(14) }, windows)).toEqual({ early: false, late: false });
    // Samstag geschlossen
    expect(classifyShift({ date: "2026-10-17", startMin: h(8), endMin: h(12) }, windows)).toEqual({ early: false, late: false });
  });

  it("bewertet die Belastung relativ zum Team", () => {
    const counts = edgeCounts(
      [
        shift("1", "a", "2026-10-12", h(8), h(12)),
        shift("2", "a", "2026-10-13", h(14), h(18)),
        shift("3", "b", "2026-10-12", h(10), h(14)),
        shift("4", "b", "2026-10-13", h(10), h(14)),
      ],
      windows,
    );
    const load = edgeLoad(counts);
    expect(load.get("a")!).toBeGreaterThan(0);
    expect(load.get("b")!).toBeLessThan(0);
  });
});
