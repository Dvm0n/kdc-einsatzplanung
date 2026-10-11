import { describe, expect, it } from "vitest";
import { erlangC, grossAgents, requiredAgents, serviceLevel, trafficIntensity } from "./erlang";

describe("Erlang C", () => {
  it("berechnet die Verkehrslast", () => {
    expect(trafficIntensity(100, 180, 1800)).toBe(10);
    expect(trafficIntensity(0, 180, 1800)).toBe(0);
  });

  // Referenz: klassisches Lehrbuchbeispiel (A = 10 Erlang, AHT 180 s, 80/20)
  it("liefert die bekannten Referenzwerte", () => {
    expect(erlangC(11, 10)).toBeCloseTo(0.6821, 3);
    expect(erlangC(13, 10)).toBeCloseTo(0.2853, 3);
    expect(serviceLevel(14, 10, 180, 20)).toBeCloseTo(0.8884, 3);
    expect(serviceLevel(13, 10, 180, 20)).toBeLessThan(0.8);
  });

  it("findet die minimale Agentenzahl für 80/20", () => {
    const r = requiredAgents({
      calls: 100,
      ahtSeconds: 180,
      intervalSeconds: 1800,
      serviceLevelTarget: 0.8,
      serviceLevelSeconds: 20,
    });
    expect(r.agents).toBe(14);
    expect(r.serviceLevel).toBeGreaterThanOrEqual(0.8);
  });

  it("berücksichtigt die maximale Auslastung", () => {
    const r = requiredAgents({
      calls: 100,
      ahtSeconds: 180,
      intervalSeconds: 1800,
      serviceLevelTarget: 0.5,
      serviceLevelSeconds: 20,
      maxOccupancy: 0.7,
    });
    expect(r.agents).toBe(15); // 10 / 0.7 = 14.3 → 15
    expect(r.occupancy).toBeLessThanOrEqual(0.7);
  });

  it("braucht bei kleinem Volumen mindestens einen Agenten", () => {
    const r = requiredAgents({
      calls: 2,
      ahtSeconds: 240,
      intervalSeconds: 1800,
      serviceLevelTarget: 0.8,
      serviceLevelSeconds: 20,
    });
    expect(r.agents).toBeGreaterThanOrEqual(1);
  });

  it("braucht ohne Anrufe niemanden", () => {
    const r = requiredAgents({
      calls: 0,
      ahtSeconds: 240,
      intervalSeconds: 1800,
      serviceLevelTarget: 0.8,
      serviceLevelSeconds: 20,
    });
    expect(r.agents).toBe(0);
  });

  it("rechnet Shrinkage auf", () => {
    expect(grossAgents(9, 0.25)).toBeCloseTo(12, 5);
    expect(grossAgents(0, 0.25)).toBe(0);
  });
});
