import { describe, expect, it } from "vitest";
import { validateWeek } from "./rules";
import { buildSegments, normalizeSegments, requiredBreak } from "./shifts";
import type { ActivityDTO, EmployeeDTO, ShiftDTO } from "./types";

const h = (x: number) => x * 60;

const activities: ActivityDTO[] = [
  { id: "in", key: "INBOUND", name: "Inbound", color: "", isPhoneTime: true, isWorkTime: true, isBreak: false },
  { id: "out", key: "OUTBOUND", name: "Outbound", color: "", isPhoneTime: false, isWorkTime: true, isBreak: false },
  { id: "br", key: "BREAK", name: "Pause", color: "", isPhoneTime: false, isWorkTime: false, isBreak: true },
];
const emp: EmployeeDTO = {
  id: "e1",
  firstName: "A",
  lastName: "B",
  color: "",
  contractType: "PARTTIME",
  weeklyHours: 20,
  maxHoursPerDay: 8,
  skills: ["INBOUND"],
};
const settings = { breakAfter6hMinutes: 30, breakAfter9hMinutes: 45, minRestHours: 11, maxHoursPerDay: 10 };
const shift = (id: string, date: string, s: number, e: number, segs = buildSegments(s, e, "in", "br")): ShiftDTO => ({
  id,
  employeeId: "e1",
  date,
  startMin: s,
  endMin: e,
  segments: segs,
});
const run = (shifts: ShiftDTO[]) =>
  validateWeek({
    shifts,
    employees: [emp],
    activities,
    absences: [],
    serviceHours: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMin: h(8), endMin: h(18) })),
    closedDates: [],
    settings,
  });

describe("Pausen", () => {
  it("braucht bis 6 h keine Pause", () => {
    expect(requiredBreak(h(6))).toBe(0);
    expect(buildSegments(h(8), h(12), "in", "br")).toHaveLength(1);
  });

  it("setzt ab mehr als 6 h 30 Minuten Pause in die Mitte", () => {
    const segs = buildSegments(h(8), h(16.5), "in", "br");
    expect(segs).toHaveLength(3);
    expect(segs[1]).toEqual({ activityTypeId: "br", startMin: h(12), endMin: h(12.5) });
  });

  it("setzt 45 Minuten bei mehr als 9 h Arbeit", () => {
    expect(requiredBreak(h(9.5) + 15)).toBe(45);
    expect(requiredBreak(h(9.5))).toBe(30);
  });
});

describe("normalizeSegments", () => {
  it("füllt Lücken und fasst Nachbarn zusammen", () => {
    const out = normalizeSegments(h(8), h(12), [{ activityTypeId: "out", startMin: h(10), endMin: h(11) }], "in");
    expect(out).toEqual([
      { activityTypeId: "in", startMin: h(8), endMin: h(10) },
      { activityTypeId: "out", startMin: h(10), endMin: h(11) },
      { activityTypeId: "in", startMin: h(11), endMin: h(12) },
    ]);
  });
});

describe("Regelprüfung", () => {
  it("meldet fehlende Pause", () => {
    const w = run([shift("s1", "2026-10-12", h(8), h(15), [{ activityTypeId: "in", startMin: h(8), endMin: h(15) }])]);
    expect(w.some((x) => x.level === "error" && x.message.includes("Pause"))).toBe(true);
  });

  it("meldet zu kurze Ruhezeit", () => {
    const w = run([shift("s1", "2026-10-12", h(14), h(18)), shift("s2", "2026-10-13", h(4), h(8))]);
    expect(w.some((x) => x.message.includes("Ruhezeit"))).toBe(true);
  });

  it("meldet fehlenden Skill und Überschreitung des Solls", () => {
    const shifts = ["12", "13", "14", "15", "16"].map((d, i) =>
      shift(`s${i}`, `2026-10-${d}`, h(8), h(13), [{ activityTypeId: "out", startMin: h(8), endMin: h(13) }]),
    );
    const w = run(shifts);
    expect(w.some((x) => x.message.includes("kein Outbound-Skill"))).toBe(true);
    expect(w.some((x) => x.message.includes("über Soll"))).toBe(true);
  });

  it("ist bei einem sauberen Plan still", () => {
    const shifts = ["12", "13", "14", "15", "16"].map((d, i) => shift(`s${i}`, `2026-10-${d}`, h(8), h(12)));
    expect(run(shifts)).toEqual([]);
  });
});
