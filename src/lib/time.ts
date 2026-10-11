import { addDays, format, getISOWeek, getISODay, startOfISOWeek } from "date-fns";
import { de } from "date-fns/locale";

/** Kalenderdaten werden als UTC-Mitternacht gespeichert (@db.Date). */
export function toDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/** "2026-10-12" → UTC-Mitternacht */
export function parseDateOnly(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Montag der Woche (als UTC-Datum) */
export function weekStartOf(d: Date): Date {
  const local = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return toDateOnly(startOfISOWeek(local));
}

export function addDaysUTC(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDaysUTC(weekStart, i));
}

/** 1 = Montag … 7 = Sonntag */
export function isoWeekday(d: Date): number {
  return getISODay(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function isoWeekNumber(d: Date): number {
  return getISOWeek(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function local(d: Date) {
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function fmtDay(d: Date, pattern = "EEE dd.MM."): string {
  return format(local(d), pattern, { locale: de });
}

export function fmtWeekRange(weekStart: Date): string {
  const end = addDays(local(weekStart), 6);
  return `${format(local(weekStart), "dd.MM.", { locale: de })} – ${format(end, "dd.MM.yyyy", { locale: de })}`;
}

/** 510 → "08:30" */
export function minToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "08:30" → 510 */
export function hhmmToMin(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function hoursLabel(minutes: number): string {
  const h = minutes / 60;
  return `${h.toLocaleString("de-DE", { maximumFractionDigits: 2 })} h`;
}

export const WEEKDAY_NAMES = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
export const WEEKDAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export function addDaysDate(d: Date, n: number) {
  return addDaysUTC(d, n);
}
