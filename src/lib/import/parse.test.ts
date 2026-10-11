import { describe, expect, it } from "vitest";
import { applyMapping, guessMapping, parseDateCell, parseDurationCell, parseTimeCell, readTable } from "./parse";

const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe("Import-Parser", () => {
  it("liest deutsche CSV mit Semikolon", async () => {
    const t = await readTable("export.csv", enc("Datum;Intervall;Angeboten;Angenommen;AHT\n05.10.2026;08:00;12;11;03:20\n"));
    expect(t.headers).toEqual(["Datum", "Intervall", "Angeboten", "Angenommen", "AHT"]);
    const map = guessMapping(t.headers);
    expect(map).toMatchObject({ date: 0, time: 1, offered: 2, handled: 3, aht: 4 });
    const { rows, errors } = applyMapping(t, { date: 0, time: 1, offered: 2, handled: 3, aht: 4, talkTotal: null });
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ date: "2026-10-05", startMin: 480, offered: 12, handled: 11, ahtSeconds: 200 }]);
  });

  it("erkennt Datum mit Uhrzeit in einer Spalte und Gesamtgesprächszeit", async () => {
    const t = await readTable("x.csv", enc("timestamp,calls,answered,talk total\n2026-10-05 14:30,10,8,00:40:00\n"));
    const { rows } = applyMapping(t, { date: 0, time: null, offered: 1, handled: 2, aht: null, talkTotal: 3 });
    expect(rows[0]).toMatchObject({ date: "2026-10-05", startMin: 870, ahtSeconds: 300 });
  });

  it("parst verschiedene Formate", () => {
    expect(parseDateCell("5.10.26")).toEqual({ date: "2026-10-05", minutes: null });
    expect(parseTimeCell("08:30 - 09:00")).toBe(510);
    expect(parseTimeCell(0.375)).toBe(540);
    expect(parseDurationCell("1:02:03")).toBe(3723);
    expect(parseDurationCell("245,5")).toBe(245.5);
  });

  it("meldet fehlerhafte Zeilen", async () => {
    const t = await readTable("x.csv", enc("Datum;Zeit;Anrufe;AHT\nfoo;08:00;3;200\n05.10.2026;08:00;;200\n"));
    const { rows, errors } = applyMapping(t, { date: 0, time: 1, offered: 2, handled: null, aht: 3, talkTotal: null });
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(2);
  });
});
