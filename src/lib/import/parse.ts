/**
 * Einlesen von Anrufhistorie aus CSV/XLSX-Exporten der Telefonanlage.
 * Die Datei wird als Tabelle (Kopfzeile + Zeilen) gelesen; welche Spalte was enthält, legt der Admin per Zuordnung fest.
 */
import ExcelJS from "exceljs";
import Papa from "papaparse";

export type Cell = string | number | Date | null;
export interface Table {
  headers: string[];
  rows: Cell[][];
}

export interface ColumnMapping {
  /** Spalte mit Datum oder Datum+Uhrzeit */
  date: number;
  /** Spalte mit Intervallbeginn (optional, wenn `date` bereits die Uhrzeit enthält) */
  time: number | null;
  offered: number;
  handled: number | null;
  /** AHT in Sekunden oder mm:ss / hh:mm:ss */
  aht: number | null;
  /** Alternativ: Gesamtgesprächszeit (Sekunden oder hh:mm:ss) → AHT = Summe / angenommene Anrufe */
  talkTotal: number | null;
}

export interface ParsedRow {
  date: string;
  startMin: number;
  offered: number;
  handled: number | null;
  ahtSeconds: number;
}

export async function readTable(fileName: string, data: ArrayBuffer): Promise<Table> {
  if (/\.xlsx$/i.test(fileName)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(data);
    const ws = wb.worksheets[0];
    if (!ws) return { headers: [], rows: [] };
    const all: Cell[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values = (row.values as unknown[]).slice(1).map(normalizeExcelCell);
      all.push(values);
    });
    const [head = [], ...rows] = all;
    return { headers: head.map((h) => String(h ?? "").trim()), rows };
  }
  let text = new TextDecoder("utf-8").decode(data);
  if (text.includes("�")) text = new TextDecoder("windows-1252").decode(data);
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: true, delimiter: "" });
  const [head = [], ...rows] = res.data;
  return { headers: head.map((h) => h.trim()), rows: rows.map((r) => r.map((c) => (c === "" ? null : c.trim()))) };
}

function normalizeExcelCell(v: unknown): Cell {
  if (v == null) return null;
  if (v instanceof Date || typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (o.result !== undefined) return normalizeExcelCell(o.result);
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.text !== undefined) return String(o.text);
  }
  return String(v);
}

/** Schlägt eine Zuordnung anhand typischer Spaltennamen vor. */
export function guessMapping(headers: string[]): Partial<ColumnMapping> {
  const find = (...patterns: RegExp[]) => {
    const i = headers.findIndex((h) => patterns.some((p) => p.test(h)));
    return i >= 0 ? i : null;
  };
  return {
    date: find(/datum|date|tag|zeitpunkt|timestamp/i) ?? 0,
    time: find(/uhrzeit|^zeit$|time|intervall|interval|von|beginn|start/i),
    offered: find(/angeboten|eingehend|offered|anrufe|calls|anzahl/i) ?? undefined,
    handled: find(/angenommen|beantwortet|handled|answered|bearbeitet/i),
    aht: find(/aht|bearbeitungszeit|ø.*dauer|durchschn|avg|handle/i),
    talkTotal: find(/gesamt.*(zeit|dauer)|summe|total.*(talk|time)/i),
  };
}

/** Excel-Seriennummer (Tage seit 1899-12-30) */
function fromExcelSerial(n: number): Date {
  return new Date(Math.round((n - 25569) * 86_400_000));
}

/** Datum (+ optional Uhrzeit) aus einer Zelle lesen. Gibt UTC-Bestandteile zurück. */
export function parseDateCell(v: Cell): { date: string; minutes: number | null } | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    // exceljs liefert Zeitstempel als UTC-Werte der in Excel angezeigten Zeit
    const iso = v.toISOString();
    const minutes = v.getUTCHours() * 60 + v.getUTCMinutes();
    return { date: iso.slice(0, 10), minutes: minutes || null };
  }
  if (typeof v === "number") {
    if (v > 20000 && v < 80000) return parseDateCell(fromExcelSerial(v));
    return null;
  }
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, minutes: m[4] ? +m[4] * 60 + +m[5] : null };
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:,?\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return { date: `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`, minutes: m[4] ? +m[4] * 60 + +m[5] : null };
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) return { date: `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`, minutes: m[4] ? +m[4] * 60 + +m[5] : null };
  return null;
}

/** Uhrzeit: "08:00", "8:00-8:30", "08:00:00", Excel-Bruchteil oder Date */
export function parseTimeCell(v: Cell): number | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.getUTCHours() * 60 + v.getUTCMinutes();
  if (typeof v === "number") return v >= 0 && v < 1 ? Math.round(v * 1440) : null;
  const m = v.trim().match(/^(\d{1,2})[:.](\d{2})/);
  return m ? +m[1] * 60 + +m[2] : null;
}

/** Dauer in Sekunden: Zahl (Sekunden), "mm:ss", "hh:mm:ss" oder Excel-Bruchteil eines Tages */
export function parseDurationCell(v: Cell): number | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.getUTCHours() * 3600 + v.getUTCMinutes() * 60 + v.getUTCSeconds();
  if (typeof v === "number") return v > 0 && v < 1 ? Math.round(v * 86400) : v;
  const s = v.trim();
  const parts = s.split(":").map((p) => Number(p.replace(",", ".")));
  if (parts.length === 3 && parts.every(Number.isFinite)) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2 && parts.every(Number.isFinite)) return parts[0] * 60 + parts[1];
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function parseNumberCell(v: Cell): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  if (v instanceof Date) return null;
  const n = Number(v.trim().replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function applyMapping(table: Table, map: ColumnMapping): { rows: ParsedRow[]; errors: string[] } {
  const rows: ParsedRow[] = [];
  const errors: string[] = [];
  table.rows.forEach((r, idx) => {
    const line = idx + 2;
    const d = parseDateCell(r[map.date] ?? null);
    if (!d) {
      errors.push(`Zeile ${line}: Datum nicht erkannt`);
      return;
    }
    const startMin = map.time != null ? parseTimeCell(r[map.time] ?? null) : d.minutes;
    if (startMin == null) {
      errors.push(`Zeile ${line}: Uhrzeit nicht erkannt`);
      return;
    }
    const offered = parseNumberCell(r[map.offered] ?? null);
    if (offered == null || offered < 0) {
      errors.push(`Zeile ${line}: Anzahl Anrufe fehlt`);
      return;
    }
    const handled = map.handled != null ? parseNumberCell(r[map.handled] ?? null) : null;
    let aht: number | null = map.aht != null ? parseDurationCell(r[map.aht] ?? null) : null;
    if (aht == null && map.talkTotal != null) {
      const total = parseDurationCell(r[map.talkTotal] ?? null);
      const base = handled ?? offered;
      if (total != null && base > 0) aht = total / base;
    }
    if (aht == null && offered > 0) {
      errors.push(`Zeile ${line}: Gesprächsdauer fehlt`);
      return;
    }
    rows.push({ date: d.date, startMin, offered, handled, ahtSeconds: aht ?? 0 });
  });
  return { rows, errors };
}
