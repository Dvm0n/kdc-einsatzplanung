"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, fail, zodMessage } from "@/lib/action-result";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { notifyEmployees, notifyUsers } from "@/lib/notify";
import { buildSegments, normalizeSegments } from "@/lib/planning/shifts";
import { computeWeekDemand } from "@/lib/demand";
import { autoSchedule } from "@/lib/planning/autoschedule";
import { getOrCreateWeek, loadWeek, resolveAvailability, toShiftDTO } from "@/lib/schedule";
import { requirePlanner } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { addDaysUTC, fmtDay, formatDateOnly, isoWeekNumber, parseDateOnly, weekStartOf } from "@/lib/time";

const segmentSchema = z.object({
  activityTypeId: z.string().min(1),
  startMin: z.number().int().min(0).max(1440),
  endMin: z.number().int().min(0).max(1440),
});

const shiftSchema = z
  .object({
    id: z.string().optional(),
    employeeId: z.string().min(1, "Mitarbeiter fehlt"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startMin: z.number().int().min(0).max(1440),
    endMin: z.number().int().min(0).max(1440),
    activityTypeId: z.string().min(1, "Aktivität fehlt"),
    autoBreak: z.boolean(),
    segments: z.array(segmentSchema).optional(),
    note: z.string().trim().max(300).optional().nullable(),
  })
  .refine((s) => s.endMin > s.startMin, "Ende muss nach dem Beginn liegen")
  .refine((s) => s.endMin - s.startMin <= 12 * 60, "Eine Schicht darf höchstens 12 Stunden umfassen");

export type ShiftInput = z.input<typeof shiftSchema>;

/** Nach Änderungen an einer veröffentlichten Woche: Version erhöhen und Betroffene informieren. */
async function touchWeek(weekStart: Date, employeeIds: string[]) {
  const week = await db.scheduleWeek.findUnique({ where: { weekStart } });
  if (week?.status !== "PUBLISHED") return;
  await db.scheduleWeek.update({ where: { id: week.id }, data: { version: { increment: 1 } } });
  await notifyEmployees(employeeIds, {
    title: `Dein Plan für KW ${isoWeekNumber(weekStart)} wurde geändert`,
    body: "Bitte prüfe deine Schichten.",
    link: `/mein-plan?w=${formatDateOnly(weekStart)}`,
  });
}

function revalidatePlan() {
  revalidatePath("/plan");
  revalidatePath("/mein-plan");
}

export async function saveShift(input: ShiftInput): Promise<ActionResult> {
  const user = await requirePlanner();
  const p = shiftSchema.safeParse(input);
  if (!p.success) return fail(zodMessage(p.error));
  const s = p.data;
  const date = parseDateOnly(s.date);
  const weekStart = weekStartOf(date);
  const settings = await getSettings();

  const breakAct = await db.activityType.findFirst({ where: { isBreak: true }, orderBy: { sortOrder: "asc" } });
  const segments =
    s.autoBreak || !s.segments?.length
      ? buildSegments(s.startMin, s.endMin, s.activityTypeId, s.autoBreak ? (breakAct?.id ?? null) : null, settings)
      : normalizeSegments(s.startMin, s.endMin, s.segments, s.activityTypeId);

  const overlap = await db.shift.findFirst({
    where: {
      employeeId: s.employeeId,
      date,
      id: s.id ? { not: s.id } : undefined,
      startMin: { lt: s.endMin },
      endMin: { gt: s.startMin },
    },
  });
  if (overlap) return fail("Überschneidung mit einer anderen Schicht dieses Mitarbeiters");

  const week = await getOrCreateWeek(weekStart);
  const affected = new Set([s.employeeId]);

  if (s.id) {
    const before = await db.shift.findUnique({ where: { id: s.id } });
    if (!before) return fail("Schicht nicht gefunden");
    affected.add(before.employeeId);
    await db.$transaction([
      db.shiftSegment.deleteMany({ where: { shiftId: s.id } }),
      db.shift.update({
        where: { id: s.id },
        data: {
          weekId: week.id,
          employeeId: s.employeeId,
          date,
          startMin: s.startMin,
          endMin: s.endMin,
          note: s.note || null,
          segments: { create: segments },
        },
      }),
    ]);
  } else {
    await db.shift.create({
      data: {
        weekId: week.id,
        employeeId: s.employeeId,
        date,
        startMin: s.startMin,
        endMin: s.endMin,
        note: s.note || null,
        segments: { create: segments },
      },
    });
  }
  await audit(user.id, s.id ? "update" : "create", "Shift", s.id ?? null, JSON.parse(JSON.stringify({ ...s, segments })));
  await touchWeek(weekStart, [...affected]);
  revalidatePlan();
  return { ok: true, message: s.id ? "Schicht aktualisiert" : "Schicht angelegt" };
}

const shapeSchema = z.array(
  z.object({
    id: z.string().min(1),
    startMin: z.number().int().min(0).max(1440),
    endMin: z.number().int().min(0).max(1440),
    segments: z.array(segmentSchema).min(1),
  }),
);

/** Ändert Zeiten/Segmente mehrerer Schichten in einem Schritt (Tagesansicht, Outbound-Vorschlag). */
export async function saveShiftShapes(input: z.input<typeof shapeSchema>, message?: string): Promise<ActionResult> {
  const user = await requirePlanner();
  const p = shapeSchema.safeParse(input);
  if (!p.success) return fail(zodMessage(p.error));

  const shifts = await db.shift.findMany({ where: { id: { in: p.data.map((x) => x.id) } } });
  const byId = new Map(shifts.map((s) => [s.id, s]));
  const updates: { id: string; startMin: number; endMin: number; segments: { activityTypeId: string; startMin: number; endMin: number }[] }[] = [];
  for (const item of p.data) {
    const s = byId.get(item.id);
    if (!s) return fail("Schicht nicht gefunden");
    if (item.endMin <= item.startMin) return fail("Ende muss nach dem Beginn liegen");
    if (item.endMin - item.startMin > 12 * 60) return fail("Eine Schicht darf höchstens 12 Stunden umfassen");
    const overlap = await db.shift.findFirst({
      where: {
        employeeId: s.employeeId,
        date: s.date,
        id: { notIn: p.data.map((x) => x.id) },
        startMin: { lt: item.endMin },
        endMin: { gt: item.startMin },
      },
    });
    if (overlap) return fail("Überschneidung mit einer anderen Schicht");
    const fallback = item.segments[0].activityTypeId;
    updates.push({ ...item, segments: normalizeSegments(item.startMin, item.endMin, item.segments, fallback) });
  }

  await db.$transaction(
    updates.flatMap((u) => [
      db.shiftSegment.deleteMany({ where: { shiftId: u.id } }),
      db.shift.update({
        where: { id: u.id },
        data: { startMin: u.startMin, endMin: u.endMin, segments: { create: u.segments } },
      }),
    ]),
  );
  await audit(user.id, "updateShapes", "Shift", null, JSON.parse(JSON.stringify(updates)));
  const weeks = new Map<number, { start: Date; emps: Set<string> }>();
  for (const s of shifts) {
    const ws = weekStartOf(s.date);
    const w = weeks.get(ws.getTime()) ?? { start: ws, emps: new Set<string>() };
    w.emps.add(s.employeeId);
    weeks.set(ws.getTime(), w);
  }
  for (const w of weeks.values()) await touchWeek(w.start, [...w.emps]);
  revalidatePlan();
  return { ok: true, message: message ?? "Gespeichert" };
}

export async function moveShift(id: string, employeeId: string, dateIso: string, copy = false): Promise<ActionResult> {
  const user = await requirePlanner();
  const shift = await db.shift.findUnique({ where: { id }, include: { segments: true } });
  if (!shift) return fail("Schicht nicht gefunden");
  const date = parseDateOnly(dateIso);
  if (!copy && shift.employeeId === employeeId && formatDateOnly(shift.date) === dateIso) return { ok: true };

  const overlap = await db.shift.findFirst({
    where: {
      employeeId,
      date,
      id: copy ? undefined : { not: id },
      startMin: { lt: shift.endMin },
      endMin: { gt: shift.startMin },
    },
  });
  if (overlap) return fail("Überschneidung mit einer anderen Schicht");

  const weekStart = weekStartOf(date);
  const week = await getOrCreateWeek(weekStart);
  if (copy) {
    await db.shift.create({
      data: {
        weekId: week.id,
        employeeId,
        date,
        startMin: shift.startMin,
        endMin: shift.endMin,
        note: shift.note,
        segments: {
          create: shift.segments.map(({ activityTypeId, startMin, endMin }) => ({ activityTypeId, startMin, endMin })),
        },
      },
    });
  } else {
    await db.shift.update({ where: { id }, data: { employeeId, date, weekId: week.id } });
  }
  await audit(user.id, copy ? "copy" : "move", "Shift", id, { employeeId, date: dateIso });
  await touchWeek(weekStart, [shift.employeeId, employeeId]);
  const oldWeek = weekStartOf(shift.date);
  if (oldWeek.getTime() !== weekStart.getTime() && !copy) await touchWeek(oldWeek, [shift.employeeId]);
  revalidatePlan();
  return { ok: true, message: copy ? "Schicht kopiert" : "Schicht verschoben" };
}

export async function deleteShift(id: string): Promise<ActionResult> {
  const user = await requirePlanner();
  const shift = await db.shift.findUnique({ where: { id } });
  if (!shift) return fail("Schicht nicht gefunden");
  await db.shift.delete({ where: { id } });
  await audit(user.id, "delete", "Shift", id, { employeeId: shift.employeeId, date: formatDateOnly(shift.date) });
  await touchWeek(weekStartOf(shift.date), [shift.employeeId]);
  revalidatePlan();
  return { ok: true, message: "Schicht gelöscht" };
}

export async function copyPreviousWeek(weekStartIso: string): Promise<ActionResult> {
  const user = await requirePlanner();
  const weekStart = parseDateOnly(weekStartIso);
  const prevStart = addDaysUTC(weekStart, -7);
  const existing = await db.shift.count({ where: { date: { gte: weekStart, lte: addDaysUTC(weekStart, 6) } } });
  if (existing > 0) return fail("Die Woche enthält bereits Schichten. Bitte zuerst leeren.");

  const [prevShifts, absences, holidays] = await Promise.all([
    db.shift.findMany({
      where: { date: { gte: prevStart, lte: addDaysUTC(prevStart, 6) }, employee: { active: true } },
      include: { segments: true },
    }),
    db.absenceRequest.findMany({
      where: { status: "APPROVED", startDate: { lte: addDaysUTC(weekStart, 6) }, endDate: { gte: weekStart } },
    }),
    db.holiday.findMany({ where: { closed: true, date: { gte: weekStart, lte: addDaysUTC(weekStart, 6) } } }),
  ]);
  if (prevShifts.length === 0) return fail("In der Vorwoche gibt es keine Schichten.");

  const closed = new Set(holidays.map((h) => formatDateOnly(h.date)));
  const week = await getOrCreateWeek(weekStart);
  let created = 0;
  let skipped = 0;
  for (const s of prevShifts) {
    const date = addDaysUTC(s.date, 7);
    const iso = formatDateOnly(date);
    const absent = absences.some((a) => a.employeeId === s.employeeId && a.startDate <= date && a.endDate >= date);
    if (absent || closed.has(iso)) {
      skipped++;
      continue;
    }
    await db.shift.create({
      data: {
        weekId: week.id,
        employeeId: s.employeeId,
        date,
        startMin: s.startMin,
        endMin: s.endMin,
        note: s.note,
        segments: { create: s.segments.map(({ activityTypeId, startMin, endMin }) => ({ activityTypeId, startMin, endMin })) },
      },
    });
    created++;
  }
  await audit(user.id, "copyWeek", "ScheduleWeek", week.id, { from: formatDateOnly(prevStart), created, skipped });
  revalidatePlan();
  return {
    ok: true,
    message: `${created} Schichten übernommen${skipped ? `, ${skipped} wegen Abwesenheit/Feiertag ausgelassen` : ""}`,
  };
}

export async function clearWeek(weekStartIso: string): Promise<ActionResult> {
  const user = await requirePlanner();
  const weekStart = parseDateOnly(weekStartIso);
  const week = await db.scheduleWeek.findUnique({ where: { weekStart } });
  if (week?.status === "PUBLISHED") return fail("Veröffentlichte Wochen können nicht geleert werden. Zuerst zurückziehen.");
  const r = await db.shift.deleteMany({ where: { date: { gte: weekStart, lte: addDaysUTC(weekStart, 6) } } });
  await audit(user.id, "clearWeek", "ScheduleWeek", week?.id ?? null, { count: r.count });
  revalidatePlan();
  return { ok: true, message: `${r.count} Schichten entfernt` };
}

export async function generateProposal(
  weekStartIso: string,
  opts: { fillOutbound: boolean },
): Promise<ActionResult<{ created: number }>> {
  const user = await requirePlanner();
  const weekStart = parseDateOnly(weekStartIso);
  const week = await getOrCreateWeek(weekStart);
  if (week.status === "PUBLISHED") return fail("Die Woche ist veröffentlicht. Bitte zuerst zurück in den Entwurf setzen.");

  const data = await loadWeek(weekStart);
  const settings = await getSettings();
  const { days } = await computeWeekDemand(weekStart, data.shifts, data.activities);
  const inbound = data.activities.find((a) => a.key === "INBOUND") ?? data.activities.find((a) => a.isPhoneTime);
  if (!inbound) return fail("Keine Inbound-Aktivität definiert");
  const outbound = data.activities.find((a) => a.key === "OUTBOUND");
  const brk = data.activities.find((a) => a.isBreak);
  const prev = await db.shift.findMany({
    where: { date: { gte: addDaysUTC(weekStart, -1), lt: weekStart } },
    include: { segments: true },
  });

  const result = autoSchedule({
    days: days.map((d) => ({
      date: d.date,
      windows: d.windows,
      // Bedarf nur aus der Prognose, ohne die bereits geplanten Schichten (die zählt autoSchedule selbst)
      intervals: d.intervals.map((i) => ({ startMin: i.startMin, endMin: i.endMin, required: i.required })),
    })),
    employees: data.employees,
    existing: data.shifts,
    previousShifts: prev.map(toShiftDTO),
    absences: data.absences,
    availability: await resolveAvailability(weekStart),
    activityIds: { inbound: inbound.id, outbound: outbound?.id ?? null, break: brk?.id ?? null },
    settings: { ...settings, intervalMinutes: settings.intervalMinutes },
    options: { fillOutbound: opts.fillOutbound },
  });

  for (const s of result.shifts) {
    await db.shift.create({
      data: {
        weekId: week.id,
        employeeId: s.employeeId,
        date: parseDateOnly(s.date),
        startMin: s.startMin,
        endMin: s.endMin,
        segments: { create: s.segments },
      },
    });
  }
  await audit(user.id, "autoschedule", "ScheduleWeek", week.id, { created: result.shifts.length, ...result.stats });
  revalidatePlan();
  const gap = result.stats.remainingDeficitHours;
  return {
    ok: true,
    data: { created: result.shifts.length },
    message:
      result.shifts.length === 0
        ? "Keine weiteren Schichten nötig oder möglich"
        : `${result.shifts.length} Schichten vorgeschlagen${
            gap > 0.01 ? ` · ${gap.toLocaleString("de-DE", { maximumFractionDigits: 1 })} h Bedarf bleiben offen` : " · Bedarf gedeckt"
          }`,
  };
}

export async function publishWeek(weekStartIso: string): Promise<ActionResult> {
  const user = await requirePlanner();
  const weekStart = parseDateOnly(weekStartIso);
  const week = await getOrCreateWeek(weekStart);
  await db.scheduleWeek.update({
    where: { id: week.id },
    data: { status: "PUBLISHED", publishedAt: new Date(), version: { increment: 1 } },
  });
  const users = await db.user.findMany({ where: { active: true, employee: { isNot: null } }, select: { id: true } });
  await notifyUsers(
    users.map((u) => u.id),
    {
      title: `Plan für KW ${isoWeekNumber(weekStart)} veröffentlicht`,
      body: `Der Einsatzplan ab ${fmtDay(weekStart, "dd.MM.yyyy")} ist jetzt verfügbar.`,
      link: `/mein-plan?w=${weekStartIso}`,
    },
    { email: true },
  );
  await audit(user.id, "publish", "ScheduleWeek", week.id);
  revalidatePlan();
  return { ok: true, message: "Woche veröffentlicht – alle wurden benachrichtigt" };
}

export async function unpublishWeek(weekStartIso: string): Promise<ActionResult> {
  const user = await requirePlanner();
  const weekStart = parseDateOnly(weekStartIso);
  await db.scheduleWeek.update({ where: { weekStart }, data: { status: "DRAFT" } });
  await audit(user.id, "unpublish", "ScheduleWeek", weekStartIso);
  revalidatePlan();
  return { ok: true, message: "Woche zurück in den Entwurf gesetzt" };
}
