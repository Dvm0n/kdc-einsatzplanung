import { db } from "@/lib/db";
import { edgeCounts, edgeLoad, type EdgeCounts } from "@/lib/planning/fairness";
import { addDaysUTC, formatDateOnly } from "@/lib/time";

const DAY = 86_400_000;

/** Monatsauswertung: geplante Stunden je Mitarbeiter vs. anteiliges Soll (Grundlage für Seite und Export). */
export async function monthReport(year: number, month: number) {
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 0));

  const [employees, shifts, absences, holidays] = await Promise.all([
    db.employee.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.shift.findMany({
      where: { date: { gte: from, lte: to } },
      include: { segments: { include: { activityType: true }, orderBy: { startMin: "asc" } } },
      orderBy: [{ date: "asc" }, { startMin: "asc" }],
    }),
    db.absenceRequest.findMany({ where: { status: "APPROVED", startDate: { lte: to }, endDate: { gte: from } } }),
    db.holiday.findMany({ where: { closed: true, date: { gte: from, lte: to } } }),
  ]);

  // Soll anteilig: Wochenstunden / 5 je Werktag (Mo–Fr ohne Feiertage)
  const holidaySet = new Set(holidays.map((x) => formatDateOnly(x.date)));
  const isWorkday = (d: Date) => {
    const wd = d.getUTCDay();
    return wd >= 1 && wd <= 5 && !holidaySet.has(formatDateOnly(d));
  };
  let workdays = 0;
  for (let d = new Date(from); d <= to; d = new Date(d.getTime() + DAY)) if (isWorkday(d)) workdays++;

  const rows = employees.map((e) => {
    const own = shifts.filter((s) => s.employeeId === e.id);
    let work = 0;
    let inbound = 0;
    let outbound = 0;
    let breaks = 0;
    for (const s of own)
      for (const seg of s.segments) {
        const len = seg.endMin - seg.startMin;
        if (seg.activityType.isWorkTime) work += len;
        if (seg.activityType.isPhoneTime) inbound += len;
        if (seg.activityType.key === "OUTBOUND") outbound += len;
        if (seg.activityType.isBreak) breaks += len;
      }
    let absentDays = 0;
    for (const a of absences.filter((x) => x.employeeId === e.id)) {
      for (let d = new Date(Math.max(a.startDate.getTime(), from.getTime())); d <= a.endDate && d <= to; d = new Date(d.getTime() + DAY)) {
        if (isWorkday(d)) absentDays++;
      }
    }
    const target = ((e.weeklyHours * 60) / 5) * (workdays - absentDays);
    return {
      employee: { id: e.id, firstName: e.firstName, lastName: e.lastName, color: e.color, weeklyHours: e.weeklyHours },
      shifts: own.length,
      work,
      inbound,
      outbound,
      breaks,
      target,
      absentDays,
    };
  });

  const total = rows.reduce(
    (s, r) => ({ work: s.work + r.work, inbound: s.inbound + r.inbound, outbound: s.outbound + r.outbound, target: s.target + r.target }),
    { work: 0, inbound: 0, outbound: 0, target: 0 },
  );

  const name = new Map(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));
  const details = shifts.map((s) => ({
    date: formatDateOnly(s.date),
    employee: name.get(s.employeeId) ?? "–",
    startMin: s.startMin,
    endMin: s.endMin,
    breakMin: s.segments.filter((x) => x.activityType.isBreak).reduce((a, x) => a + x.endMin - x.startMin, 0),
    workMin: s.segments.filter((x) => x.activityType.isWorkTime).reduce((a, x) => a + x.endMin - x.startMin, 0),
    activities: s.segments.map((x) => ({ name: x.activityType.name, startMin: x.startMin, endMin: x.endMin })),
  }));

  return { from, to, workdays, rows, total, details };
}

export type MonthReport = Awaited<ReturnType<typeof monthReport>>;

/** Früh-/Spätschichten der letzten `weeks` Wochen vor `before` je Mitarbeiter. */
export async function loadEdgeHistory(before: Date, weeks = 8): Promise<Record<string, EdgeCounts>> {
  const [shifts, windows] = await Promise.all([
    db.shift.findMany({
      where: { date: { gte: addDaysUTC(before, -7 * weeks), lt: before } },
      select: { employeeId: true, date: true, startMin: true, endMin: true },
    }),
    db.serviceHours.findMany(),
  ]);
  const counts = edgeCounts(
    shifts.map((s) => ({ ...s, date: formatDateOnly(s.date) })),
    windows.map(({ weekday, startMin, endMin }) => ({ weekday, startMin, endMin })),
  );
  return Object.fromEntries(counts);
}

/** Fairness-Übersicht für die Auswertung */
export async function fairnessReport(until: Date, weeks = 8) {
  const [history, employees] = await Promise.all([
    loadEdgeHistory(until, weeks),
    db.employee.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const counts = new Map(employees.map((e) => [e.id, history[e.id] ?? { early: 0, late: 0, shifts: 0 }]));
  const load = edgeLoad(counts);
  return employees.map((e) => ({
    employee: { id: e.id, firstName: e.firstName, lastName: e.lastName, color: e.color },
    ...counts.get(e.id)!,
    load: load.get(e.id) ?? 0,
  }));
}
