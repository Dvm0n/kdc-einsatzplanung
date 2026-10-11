import { describe, expect, it } from "vitest";
import { easterSunday, holidaysFor } from "./holidays";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("Feiertage", () => {
  it("berechnet Ostersonntag", () => {
    expect(iso(easterSunday(2025))).toBe("2025-04-20");
    expect(iso(easterSunday(2026))).toBe("2026-04-05");
    expect(iso(easterSunday(2027))).toBe("2027-03-28");
  });

  it("liefert die NRW-Feiertage 2026", () => {
    const list = holidaysFor(2026, "NW").map((h) => `${iso(h.date)} ${h.name}`);
    expect(list).toContain("2026-04-03 Karfreitag");
    expect(list).toContain("2026-06-04 Fronleichnam");
    expect(list).toContain("2026-11-01 Allerheiligen");
    expect(list.some((l) => l.includes("Reformationstag"))).toBe(false);
    expect(list).toHaveLength(11);
  });

  it("berechnet den Buß- und Bettag für Sachsen", () => {
    const h = holidaysFor(2026, "SN").find((x) => x.name === "Buß- und Bettag");
    expect(iso(h!.date)).toBe("2026-11-18");
  });
});
