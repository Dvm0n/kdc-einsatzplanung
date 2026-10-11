import { db } from "@/lib/db";
import { validateWeek, type AvailabilityBlock } from "@/lib/planning/rules";
import type { AbsenceDTO, ActivityDTO, EmployeeDTO, ShiftDTO } from "@/lib/planning/types";
import { getSettings } from "@/lib/settings";
import { addDaysUTC, formatDateOnly, isoWeekday, weekDays } from "@/lib/time";

type ShiftWithSegments = Awaited<ReturnType<typeof db.shift.findMany<{ include: { segments: true } }>>>[number];

export function toShiftDTO(s: ShiftWithSegments): ShiftDTO {
  return {
    id: s.id,
    employeeId: s.employeeId,
    date: formatDateOnly(s.date),
    startMin: s.startMin,
    endMin: s.endMin,
    note: s.note,
    segments: s.segments
      .map(({ activityTypeId, startMin, endMin }) => ({ activityTypeId, startMin, endMin }))
      .sort((a, b) => a.startMin - b.startMin),
  };
}

export async function getOrCreateWeek(weekStart: Date) {
  return db.scheduleWeek.upsert({ where: { weekStart }, update: {}, create: { weekStart } });
}

/** Wiederkehrende + datierte Verfügbarkeiten für die Tage der Woche auflösen. */
export async function resolveAvailability(weekStart: Date, employeeIds?: string[]): Promise<AvailabilityBlock[]> {
  const days = weekDays(weekStart);
  const rows = await db.availability.findMany({
    where: {
      ...(employeeIds ? { employeeId: { in: employeeIds } } : {}),
      OR: [{ date: null }, { date: { gte: days[0], lte: days[6] } }],
    },
  });
  const out: AvailabilityBlock[] = [];
  for (const day of days) {
    const iso = formatDateOnly(day);
    const wd = isoWeekday(day);
    const byEmp = new Map<string, typeof rows>();
    for (const r of rows) {
      const matches = r.date ? formatDateOnly(r.date) === iso : r.weekday === wd;
      if (matches) byEmp.set(r.employeeId, [...(byEmp.get(r.employeeId) ?? []), r]);
    }
    for (const [employeeId, list] of byEmp) {
      // datierte Einträge überschreiben die wiederkehrenden für diesen Tag
      const dated = list.filter((r) => r.date);
      for (const r of dated.length ? dated : list) {
        out.push({ employeeId, date: iso, startMin: r.startMin, endMin: r.endMin, kind: r.kind });
      }
    }
  }
  return out;
}

export async function loadWeek(weekStart: Date, opts: { withWarnings?: boolean } = {}) {
  const days = weekDays(weekStart);
  const weekEnd = days[6];
  const [settings, week, employees, activities, templates, shifts, prevShifts, absences, serviceHours, holidays] =
    await Promise.all([
      getSettings(),
      db.scheduleWeek.findUnique({ where: { weekStart } }),
      db.employee.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { lastName: "asc" }] }),
      db.activityType.findMany({ orderBy: { sortOrder: "asc" } }),
      db.shiftTemplate.findMany({ orderBy: [{ sortOrder: "asc" }, { startMin: "asc" }] }),
      db.shift.findMany({ where: { date: { gte: weekStart, lte: weekEnd } }, include: { segments: true } }),
      db.shift.findMany({ where: { date: addDaysUTC(weekStart, -1) }, include: { segments: true } }),
      db.absenceRequest.findMany({
        where: { status: "APPROVED", startDate: { lte: weekEnd }, endDate: { gte: weekStart } },
      }),
      db.serviceHours.findMany(),
      db.holiday.findMany({ where: { date: { gte: weekStart, lte: weekEnd } } }),
    ]);

  const employeeDTOs: EmployeeDTO[] = employees.map((e) => ({
    id: e.id,
    firstName: e.firstName,
    lastName: e.lastName,
    color: e.color,
    contractType: e.contractType,
    weeklyHours: e.weeklyHours,
    maxHoursPerDay: e.maxHoursPerDay,
    skills: e.skills,
  }));
  const activityDTOs: ActivityDTO[] = activities.map(({ id, key, name, color, isPhoneTime, isWorkTime, isBreak }) => ({
    id,
    key,
    name,
    color,
    isPhoneTime,
    isWorkTime,
    isBreak,
  }));
  const shiftDTOs = shifts.map(toShiftDTO);
  const absenceDTOs: AbsenceDTO[] = absences.map((a) => ({
    employeeId: a.employeeId,
    startDate: formatDateOnly(a.startDate),
    endDate: formatDateOnly(a.endDate),
    kind: a.kind,
  }));
  const serviceWindows = serviceHours.map(({ weekday, startMin, endMin }) => ({ weekday, startMin, endMin }));
  const holidayDTOs = holidays.map((h) => ({
    date: formatDateOnly(h.date),
    name: h.name,
    closed: h.closed,
    startMin: h.startMin,
    endMin: h.endMin,
  }));

  const ruleSettings = {
    breakAfter6hMinutes: settings.breakAfter6hMinutes,
    breakAfter9hMinutes: settings.breakAfter9hMinutes,
    minRestHours: settings.minRestHours,
    maxHoursPerDay: settings.maxHoursPerDay,
  };
  // Grundlage für die Regelprüfung – wird auch im Browser genutzt (Live-Feedback beim Ziehen)
  const rules = opts.withWarnings
    ? {
        unavailable: await resolveAvailability(weekStart),
        previousShifts: prevShifts.map(toShiftDTO),
        closedDates: holidayDTOs.filter((h) => h.closed).map((h) => h.date),
        settings: ruleSettings,
      }
    : null;
  const warnings = rules
    ? validateWeek({
        shifts: shiftDTOs,
        employees: employeeDTOs,
        activities: activityDTOs,
        absences: absenceDTOs,
        serviceHours: serviceWindows,
        ...rules,
      })
    : [];

  return {
    weekStart: formatDateOnly(weekStart),
    days: days.map(formatDateOnly),
    status: week?.status ?? "DRAFT",
    version: week?.version ?? 0,
    publishedAt: week?.publishedAt?.toISOString() ?? null,
    employees: employeeDTOs,
    activities: activityDTOs,
    templates: templates.map(({ id, name, startMin, endMin, activityTypeId }) => ({ id, name, startMin, endMin, activityTypeId })),
    shifts: shiftDTOs,
    absences: absenceDTOs,
    serviceHours: serviceWindows,
    holidays: holidayDTOs,
    warnings,
    rules,
    settings: {
      intervalMinutes: settings.intervalMinutes,
      breakAfter6hMinutes: settings.breakAfter6hMinutes,
      breakAfter9hMinutes: settings.breakAfter9hMinutes,
      serviceLevelSeconds: settings.serviceLevelSeconds,
    },
  };
}

export type WeekData = Awaited<ReturnType<typeof loadWeek>>;
