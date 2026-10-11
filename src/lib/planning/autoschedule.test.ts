import { describe, expect, it } from "vitest";
import { autoSchedule, type AutoDay, type AutoInput } from "./autoschedule";
import { validateWeek } from "./rules";
import type { ActivityDTO, EmployeeDTO, ShiftDTO } from "./types";

const h = (x: number) => x * 60;
const DATES = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"];

function day(date: string, required: (startMin: number) => number): AutoDay {
  const intervals = [];
  for (let m = h(8); m < h(18); m += 30) intervals.push({ startMin: m, endMin: m + 30, required: required(m) });
  return { date, windows: [{ startMin: h(8), endMin: h(18) }], intervals };
}

const emp = (id: string, weeklyHours: number, skills = ["INBOUND", "OUTBOUND"]): EmployeeDTO => ({
  id,
  firstName: id,
  lastName: "X",
  color: "",
  contractType: "PARTTIME",
  weeklyHours,
  maxHoursPerDay: 8,
  skills,
});

const activities: ActivityDTO[] = [
  { id: "in", key: "INBOUND", name: "Inbound", color: "", isPhoneTime: true, isWorkTime: true, isBreak: false },
  { id: "out", key: "OUTBOUND", name: "Outbound", color: "", isPhoneTime: false, isWorkTime: true, isBreak: false },
  { id: "br", key: "BREAK", name: "Pause", color: "", isPhoneTime: false, isWorkTime: false, isBreak: true },
];

const settings = { breakAfter6hMinutes: 30, breakAfter9hMinutes: 45, maxHoursPerDay: 10, minRestHours: 11, intervalMinutes: 30 };

function base(over: Partial<AutoInput> = {}): AutoInput {
  return {
    days: DATES.map((d) => day(d, (m) => (m >= h(9) && m < h(12) ? 3 : 1))),
    employees: [emp("a", 39), emp("b", 30), emp("c", 20), emp("d", 20, ["INBOUND"]), emp("e", 20)],
    existing: [],
    absences: [],
    availability: [],
    activityIds: { inbound: "in", outbound: "out", break: "br" },
    settings,
    ...over,
  };
}

function toShifts(r: ReturnType<typeof autoSchedule>): ShiftDTO[] {
  return r.shifts.map((s, i) => ({ id: `p${i}`, ...s }));
}

describe("Planvorschlag", () => {
  it("deckt den Bedarf und hält alle Regeln ein", () => {
    const input = base();
    const r = autoSchedule(input);
    // 80 h Telefonbedarf; ein Rest von max. 30 min ist mit den verfügbaren Vertragsstunden nicht vermeidbar
    expect(r.stats.remainingDeficitHours).toBeLessThanOrEqual(0.5);
    const warnings = validateWeek({
      shifts: toShifts(r),
      employees: input.employees,
      activities,
      absences: [],
      serviceHours: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMin: h(8), endMin: h(18) })),
      closedDates: [],
      settings,
    });
    expect(warnings.filter((w) => w.level === "error")).toEqual([]);
    expect(warnings.filter((w) => w.message.includes("über Soll"))).toEqual([]);
  });

  it("überschreitet keine Vertragsstunden und füllt sie mit Outbound auf", () => {
    const r = autoSchedule(base());
    const work = (id: string) =>
      r.shifts
        .filter((s) => s.employeeId === id)
        .reduce((sum, s) => sum + s.segments.filter((x) => x.activityTypeId !== "br").reduce((a, x) => a + x.endMin - x.startMin, 0), 0);
    expect(work("c")).toBeLessThanOrEqual(h(20) + 15);
    expect(work("c")).toBeGreaterThanOrEqual(h(17));
    expect(r.shifts.some((s) => s.segments.some((x) => x.activityTypeId === "out"))).toBe(true);
    // Mitarbeiter ohne Outbound-Skill bekommt kein Outbound
    expect(r.shifts.filter((s) => s.employeeId === "d").some((s) => s.segments.some((x) => x.activityTypeId === "out"))).toBe(false);
  });

  it("respektiert Abwesenheit und Nicht-Verfügbarkeit", () => {
    const r = autoSchedule(
      base({
        absences: [{ employeeId: "a", startDate: DATES[0], endDate: DATES[4], kind: "VACATION" }],
        availability: [{ employeeId: "b", date: DATES[0], startMin: 0, endMin: h(24), kind: "UNAVAILABLE" }],
      }),
    );
    expect(r.shifts.some((s) => s.employeeId === "a")).toBe(false);
    expect(r.shifts.some((s) => s.employeeId === "b" && s.date === DATES[0])).toBe(false);
  });

  it("legt Schichten in bevorzugte bzw. erlaubte Zeitfenster", () => {
    const r = autoSchedule(
      base({
        employees: [emp("c", 20)],
        availability: DATES.map((date) => ({ employeeId: "c", date, startMin: h(8), endMin: h(13), kind: "PREFERRED" as const })),
      }),
    );
    expect(r.shifts.length).toBeGreaterThan(0);
    expect(r.shifts.every((s) => s.startMin >= h(8) && s.endMin <= h(13))).toBe(true);
  });

  it("ergänzt vorhandene Schichten statt sie zu ersetzen", () => {
    const existing: ShiftDTO[] = [
      { id: "x", employeeId: "a", date: DATES[0], startMin: h(8), endMin: h(12), segments: [{ activityTypeId: "in", startMin: h(8), endMin: h(12) }] },
    ];
    const r = autoSchedule(base({ existing }));
    expect(r.shifts.some((s) => s.employeeId === "a" && s.date === DATES[0])).toBe(false);
  });
});
