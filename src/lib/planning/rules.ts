import { breakMinutes, workMinutes } from "./shifts";
import type { AbsenceDTO, ActivityDTO, EmployeeDTO, ServiceWindow, ShiftDTO } from "./types";

export type WarningLevel = "error" | "warning" | "info";

export interface PlanWarning {
  level: WarningLevel;
  employeeId: string;
  date?: string;
  shiftId?: string;
  message: string;
}

export interface RuleSettings {
  breakAfter6hMinutes: number;
  breakAfter9hMinutes: number;
  minRestHours: number;
  maxHoursPerDay: number;
}

export interface AvailabilityBlock {
  employeeId: string;
  date: string;
  startMin: number;
  endMin: number;
  kind: "AVAILABLE" | "PREFERRED" | "UNAVAILABLE";
}

const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const hours = (m: number) => (m / 60).toLocaleString("de-DE", { maximumFractionDigits: 1 });
const dayLabel = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
};

function isoWeekday(iso: string) {
  const d = new Date(iso + "T00:00:00Z").getUTCDay();
  return d === 0 ? 7 : d;
}

export function validateWeek(input: {
  shifts: ShiftDTO[];
  employees: EmployeeDTO[];
  activities: ActivityDTO[];
  absences: AbsenceDTO[];
  serviceHours: ServiceWindow[];
  closedDates: string[];
  unavailable?: AvailabilityBlock[];
  /** Schichten des Vortags der Woche (Sonntag) für die Ruhezeitprüfung */
  previousShifts?: ShiftDTO[];
  settings: RuleSettings;
}): PlanWarning[] {
  const { shifts, employees, activities, absences, serviceHours, closedDates, settings } = input;
  const acts = Object.fromEntries(activities.map((a) => [a.id, a]));
  const warnings: PlanWarning[] = [];

  for (const emp of employees) {
    const own = shifts.filter((s) => s.employeeId === emp.id).sort((a, b) => (a.date + a.startMin).localeCompare(b.date + b.startMin));
    let weekWork = 0;
    const byDate = new Map<string, ShiftDTO[]>();
    for (const s of own) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);

    for (const [date, dayShifts] of byDate) {
      const dayWork = dayShifts.reduce((sum, s) => sum + workMinutes(s.segments, acts), 0);
      const dayBreak = dayShifts.reduce((sum, s) => sum + breakMinutes(s.segments, acts), 0);
      weekWork += dayWork;

      const maxDay = Math.min(emp.maxHoursPerDay, settings.maxHoursPerDay) * 60;
      if (dayWork > settings.maxHoursPerDay * 60) {
        warnings.push({ level: "error", employeeId: emp.id, date, message: `${dayLabel(date)}: ${hours(dayWork)} h Arbeitszeit – gesetzliches Maximum ${settings.maxHoursPerDay} h` });
      } else if (dayWork > maxDay) {
        warnings.push({ level: "warning", employeeId: emp.id, date, message: `${dayLabel(date)}: ${hours(dayWork)} h – mehr als vereinbart (max. ${hours(maxDay)} h/Tag)` });
      }

      const needBreak = dayWork > 9 * 60 ? settings.breakAfter9hMinutes : dayWork > 6 * 60 ? settings.breakAfter6hMinutes : 0;
      if (dayBreak < needBreak) {
        warnings.push({ level: "error", employeeId: emp.id, date, message: `${dayLabel(date)}: ${needBreak} min Pause erforderlich (geplant: ${dayBreak} min)` });
      }

      for (let i = 1; i < dayShifts.length; i++) {
        if (dayShifts[i].startMin < dayShifts[i - 1].endMin) {
          warnings.push({ level: "error", employeeId: emp.id, date, shiftId: dayShifts[i].id, message: `${dayLabel(date)}: Schichten überschneiden sich` });
        }
      }

      if (closedDates.includes(date)) {
        warnings.push({ level: "warning", employeeId: emp.id, date, message: `${dayLabel(date)}: Feiertag/geschlossen` });
      }

      const absence = absences.find((a) => a.employeeId === emp.id && a.startDate <= date && a.endDate >= date);
      if (absence) {
        warnings.push({ level: "error", employeeId: emp.id, date, message: `${dayLabel(date)}: eingeplant trotz Abwesenheit` });
      }

      for (const s of dayShifts) {
        const blocked = input.unavailable?.find(
          (u) => u.employeeId === emp.id && u.date === date && u.kind === "UNAVAILABLE" && u.startMin < s.endMin && u.endMin > s.startMin,
        );
        if (blocked) {
          warnings.push({ level: "warning", employeeId: emp.id, date, shiftId: s.id, message: `${dayLabel(date)}: nicht verfügbar ${fmt(blocked.startMin)}–${fmt(blocked.endMin)}` });
        }

        const phone = s.segments.some((seg) => acts[seg.activityTypeId]?.isPhoneTime);
        if (phone && !emp.skills.includes("INBOUND")) {
          warnings.push({ level: "warning", employeeId: emp.id, date, shiftId: s.id, message: `${dayLabel(date)}: Inbound geplant, aber kein Inbound-Skill` });
        }
        const outbound = s.segments.some((seg) => acts[seg.activityTypeId]?.key === "OUTBOUND");
        if (outbound && !emp.skills.includes("OUTBOUND")) {
          warnings.push({ level: "warning", employeeId: emp.id, date, shiftId: s.id, message: `${dayLabel(date)}: Outbound geplant, aber kein Outbound-Skill` });
        }

        if (phone) {
          const windows = serviceHours.filter((w) => w.weekday === isoWeekday(date));
          const phoneSegs = s.segments.filter((seg) => acts[seg.activityTypeId]?.isPhoneTime);
          const outside = phoneSegs.some((seg) => !windows.some((w) => seg.startMin >= w.startMin && seg.endMin <= w.endMin));
          if (outside) {
            warnings.push({ level: "info", employeeId: emp.id, date, shiftId: s.id, message: `${dayLabel(date)}: Inbound teilweise außerhalb der Call-Zeiten` });
          }
        }
      }
    }

    // Ruhezeit zwischen aufeinanderfolgenden Arbeitstagen
    const all = [...(input.previousShifts ?? []).filter((s) => s.employeeId === emp.id), ...own];
    for (let i = 1; i < all.length; i++) {
      const prev = all[i - 1];
      const cur = all[i];
      if (prev.date === cur.date) continue;
      const gapDays = (Date.parse(cur.date) - Date.parse(prev.date)) / 86_400_000;
      const rest = gapDays * 1440 + cur.startMin - prev.endMin;
      if (rest < settings.minRestHours * 60) {
        warnings.push({ level: "error", employeeId: emp.id, date: cur.date, message: `${dayLabel(cur.date)}: nur ${hours(rest)} h Ruhezeit (min. ${settings.minRestHours} h)` });
      }
    }

    const target = emp.weeklyHours * 60;
    if (own.length > 0 || target > 0) {
      const diff = weekWork - target;
      if (diff > 60) {
        warnings.push({ level: "warning", employeeId: emp.id, message: `${hours(weekWork)} h geplant – ${hours(diff)} h über Soll (${hours(target)} h)` });
      } else if (diff < -60 && own.length > 0) {
        warnings.push({ level: "info", employeeId: emp.id, message: `${hours(weekWork)} h geplant – ${hours(-diff)} h unter Soll (${hours(target)} h)` });
      }
    }
  }

  const order: Record<WarningLevel, number> = { error: 0, warning: 1, info: 2 };
  return warnings.sort((a, b) => order[a.level] - order[b.level]);
}
