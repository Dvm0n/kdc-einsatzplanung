import { describe, expect, it } from "vitest";
import { computeCoverage, plannedAgents } from "./coverage";
import { forecastDay, toBins, type HistoryRow } from "./forecast";

const row = (date: string, startMin: number, offered: number, aht = 200, lengthMin = 30): HistoryRow => ({
  date,
  startMin,
  lengthMin,
  offered,
  ahtSeconds: aht,
});

describe("Forecast", () => {
  // Montage: 05.10. (Ziel), Historie 28.09., 21.09., 14.09.
  const history = [row("2026-09-28", 480, 30), row("2026-09-21", 480, 20), row("2026-09-14", 480, 10)];

  it("gewichtet jüngere Wochen stärker", () => {
    const fc = forecastDay(toBins(history), "2026-10-05", { weeks: 3, intervalMinutes: 30 });
    // (30·3 + 20·2 + 10·1) / 6 = 23,33
    expect(fc).toHaveLength(1);
    expect(fc[0].calls).toBeCloseTo(23.333, 2);
    expect(fc[0].ahtSeconds).toBeCloseTo(200, 5);
  });

  it("schließt Feiertage aus und greift weiter zurück", () => {
    const fc = forecastDay(toBins([...history, row("2026-09-07", 480, 40)]), "2026-10-05", {
      weeks: 3,
      intervalMinutes: 30,
      excluded: new Set(["2026-09-28"]),
    });
    // Stichproben: 21.09. (3), 14.09. (2), 07.09. (1) → (60 + 20 + 40) / 6 = 20
    expect(fc[0].calls).toBeCloseTo(20, 5);
  });

  it("teilt 30-Minuten-Historie auf 15-Minuten-Intervalle auf", () => {
    const fc = forecastDay(toBins([row("2026-09-28", 480, 30)]), "2026-10-05", { weeks: 1, intervalMinutes: 15 });
    expect(fc.map((f) => [f.startMin, f.calls])).toEqual([
      [480, 15],
      [495, 15],
    ]);
  });

  it("wendet einen Korrekturfaktor an", () => {
    const fc = forecastDay(toBins(history), "2026-10-05", { weeks: 3, intervalMinutes: 30, factor: 1.5 });
    expect(fc[0].calls).toBeCloseTo(35, 2);
  });
});

describe("Abdeckung", () => {
  const acts = { in: { isPhoneTime: true }, br: { isPhoneTime: false } };
  const shift = (start: number, end: number, segs = [{ activityTypeId: "in", startMin: start, endMin: end }]) => ({
    id: "x",
    employeeId: "e",
    date: "2026-10-05",
    startMin: start,
    endMin: end,
    segments: segs,
  });

  it("zählt Telefonzeit anteilig", () => {
    expect(plannedAgents([shift(480, 495)], acts, 480, 510)).toBeCloseTo(0.5, 5);
    expect(
      plannedAgents(
        [shift(480, 540, [{ activityTypeId: "in", startMin: 480, endMin: 495 }, { activityTypeId: "br", startMin: 495, endMin: 540 }])],
        acts,
        480,
        510,
      ),
    ).toBeCloseTo(0.5, 5);
  });

  it("berechnet Bedarf nur innerhalb der Call-Zeiten", () => {
    const cov = computeCoverage(
      [{ startMin: 480, calls: 100, ahtSeconds: 180 }],
      [{ startMin: 480, endMin: 540 }],
      [shift(480, 540)],
      acts,
      { intervalMinutes: 30, serviceLevelTarget: 0.8, serviceLevelSeconds: 20, maxOccupancy: 1, shrinkage: 0.25 },
    );
    expect(cov).toHaveLength(2);
    expect(cov[0].required).toBe(14);
    expect(cov[0].requiredGross).toBeCloseTo(14 / 0.75, 5);
    expect(cov[0].planned).toBe(1);
    // ohne Prognose trotzdem mindestens eine Person
    expect(cov[1].required).toBe(1);
  });
});
