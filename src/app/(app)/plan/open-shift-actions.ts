"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, fail, zodMessage } from "@/lib/action-result";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { notifyEmployees, notifyPlanners } from "@/lib/notify";
import { buildSegments } from "@/lib/planning/shifts";
import { getOrCreateWeek } from "@/lib/schedule";
import { isPlanner, requirePlanner, requireUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { fmtDay, formatDateOnly, minToHHMM, parseDateOnly, toDateOnly, weekStartOf } from "@/lib/time";

function revalidate() {
  revalidatePath("/plan");
  revalidatePath("/mein-plan");
  revalidatePath("/antraege");
  revalidatePath("/", "layout");
}

const when = (date: Date, s: number, e: number) => `${fmtDay(date, "EEE dd.MM.")} ${minToHHMM(s)}–${minToHHMM(e)}`;

async function activeOperatorIds(exclude?: string) {
  const emps = await db.employee.findMany({ where: { active: true, userId: { not: null } }, select: { id: true } });
  return emps.map((e) => e.id).filter((id) => id !== exclude);
}

/** Konflikte für eine Person an einem Tag (Überschneidung, Abwesenheit) */
async function conflictFor(employeeId: string, date: Date, startMin: number, endMin: number, ignoreShiftId?: string) {
  const [clash, absence] = await Promise.all([
    db.shift.findFirst({
      where: {
        employeeId,
        date,
        id: ignoreShiftId ? { not: ignoreShiftId } : undefined,
        startMin: { lt: endMin },
        endMin: { gt: startMin },
      },
    }),
    db.absenceRequest.findFirst({ where: { employeeId, status: "APPROVED", startDate: { lte: date }, endDate: { gte: date } } }),
  ]);
  if (clash) return "arbeitet zu dieser Zeit bereits";
  if (absence) return "ist an diesem Tag abwesend";
  return null;
}

/* ---------- Planung: Schicht ausschreiben ---------- */

const createSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startMin: z.number().int().min(0).max(1440),
    endMin: z.number().int().min(0).max(1440),
    activityTypeId: z.string().min(1),
    note: z.string().trim().max(300).optional(),
  })
  .refine((s) => s.endMin > s.startMin, "Ende muss nach dem Beginn liegen");

export async function createOpenShift(input: z.input<typeof createSchema>): Promise<ActionResult> {
  const user = await requirePlanner();
  const p = createSchema.safeParse(input);
  if (!p.success) return fail(zodMessage(p.error));
  const s = p.data;
  const date = parseDateOnly(s.date);
  if (date < toDateOnly(new Date())) return fail("Das Datum liegt in der Vergangenheit");
  const [settings, breakAct] = await Promise.all([
    getSettings(),
    db.activityType.findFirst({ where: { isBreak: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const segments = buildSegments(s.startMin, s.endMin, s.activityTypeId, breakAct?.id ?? null, settings);
  const open = await db.openShift.create({
    data: { date, startMin: s.startMin, endMin: s.endMin, segments: JSON.parse(JSON.stringify(segments)), note: s.note || null },
  });
  await notifyEmployees(
    await activeOperatorIds(),
    { title: "Offene Schicht – wer kann übernehmen?", body: when(date, s.startMin, s.endMin), link: "/mein-plan#boerse" },
    { email: true },
  );
  await audit(user.id, "create", "OpenShift", open.id, { ...s });
  revalidate();
  return { ok: true, message: "Schicht ausgeschrieben – alle wurden benachrichtigt" };
}

/* ---------- Operator: eigene Schicht an alle abgeben ---------- */

export async function offerShift(shiftId: string, note?: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.employeeId) return fail("Kein Mitarbeiterprofil");
  const shift = await db.shift.findUnique({ where: { id: shiftId }, include: { week: true, segments: true, employee: true } });
  if (!shift || shift.employeeId !== user.employeeId) return fail("Schicht nicht gefunden");
  if (shift.week.status !== "PUBLISHED") return fail("Die Woche ist noch nicht veröffentlicht");
  if (shift.date < toDateOnly(new Date())) return fail("Vergangene Schichten können nicht abgegeben werden");
  const [openRequest, openOffer] = await Promise.all([
    db.changeRequest.findFirst({ where: { shiftId, status: { in: ["PENDING", "PEER_ACCEPTED"] } } }),
    db.openShift.findFirst({ where: { sourceShiftId: shiftId, status: "OPEN" } }),
  ]);
  if (openRequest) return fail("Für diese Schicht gibt es bereits einen offenen Antrag");
  if (openOffer) return fail("Diese Schicht ist bereits in der Börse");

  const open = await db.openShift.create({
    data: {
      date: shift.date,
      startMin: shift.startMin,
      endMin: shift.endMin,
      segments: shift.segments.map(({ activityTypeId, startMin, endMin }) => ({ activityTypeId, startMin, endMin })),
      note: note?.trim() || null,
      sourceShiftId: shift.id,
      offeredById: user.employeeId,
    },
  });
  const name = `${shift.employee.firstName} ${shift.employee.lastName}`;
  await notifyEmployees(await activeOperatorIds(user.employeeId), {
    title: `${name} gibt eine Schicht ab – wer kann?`,
    body: when(shift.date, shift.startMin, shift.endMin),
    link: "/mein-plan#boerse",
  });
  await notifyPlanners({ title: `${name} bietet eine Schicht in der Börse an`, body: when(shift.date, shift.startMin, shift.endMin), link: "/antraege" });
  await audit(user.id, "offer", "OpenShift", open.id, { shiftId });
  revalidate();
  return { ok: true, message: "Schicht in die Börse gestellt – du bleibst eingeplant, bis die Planung jemanden zuteilt" };
}

/* ---------- Operator: melden / zurückziehen ---------- */

export async function bidOpenShift(openShiftId: string, bid: boolean): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.employeeId) return fail("Kein Mitarbeiterprofil");
  const open = await db.openShift.findUnique({ where: { id: openShiftId } });
  if (!open || open.status !== "OPEN") return fail("Die Schicht ist nicht mehr offen");
  if (open.offeredById === user.employeeId) return fail("Das ist deine eigene Schicht");

  if (!bid) {
    await db.openShiftBid.deleteMany({ where: { openShiftId, employeeId: user.employeeId } });
    revalidate();
    return { ok: true, message: "Meldung zurückgezogen" };
  }
  const conflict = await conflictFor(user.employeeId, open.date, open.startMin, open.endMin);
  if (conflict) return fail(`Du ${conflict}`);
  await db.openShiftBid.upsert({
    where: { openShiftId_employeeId: { openShiftId, employeeId: user.employeeId } },
    update: {},
    create: { openShiftId, employeeId: user.employeeId },
  });
  const me = await db.employee.findUniqueOrThrow({ where: { id: user.employeeId } });
  await notifyPlanners({
    title: `${me.firstName} ${me.lastName} würde eine offene Schicht übernehmen`,
    body: when(open.date, open.startMin, open.endMin),
    link: "/antraege",
  });
  await audit(user.id, "bid", "OpenShift", openShiftId);
  revalidate();
  return { ok: true, message: "Gemeldet – die Planung entscheidet" };
}

/* ---------- Planung: zuteilen / zurückziehen ---------- */

export async function assignOpenShift(openShiftId: string, employeeId: string): Promise<ActionResult> {
  const user = await requirePlanner();
  const open = await db.openShift.findUnique({ where: { id: openShiftId }, include: { bids: true } });
  if (!open || open.status !== "OPEN") return fail("Die Schicht ist nicht mehr offen");
  const emp = await db.employee.findUnique({ where: { id: employeeId } });
  if (!emp?.active) return fail("Mitarbeiter nicht gefunden");
  const conflict = await conflictFor(employeeId, open.date, open.startMin, open.endMin, open.sourceShiftId ?? undefined);
  if (conflict) return fail(`${emp.firstName} ${conflict}`);

  const weekStart = weekStartOf(open.date);
  if (open.sourceShiftId) {
    const src = await db.shift.findUnique({ where: { id: open.sourceShiftId } });
    if (!src) return fail("Die ursprüngliche Schicht existiert nicht mehr");
    await db.shift.update({ where: { id: src.id }, data: { employeeId } });
  } else {
    const week = await getOrCreateWeek(weekStart);
    const segments = (Array.isArray(open.segments) ? open.segments : []) as { activityTypeId: string; startMin: number; endMin: number }[];
    await db.shift.create({
      data: { weekId: week.id, employeeId, date: open.date, startMin: open.startMin, endMin: open.endMin, segments: { create: segments } },
    });
  }
  await db.openShift.update({ where: { id: open.id }, data: { status: "FILLED", filledById: employeeId, decidedAt: new Date() } });
  await db.scheduleWeek.updateMany({ where: { weekStart, status: "PUBLISHED" }, data: { version: { increment: 1 } } });

  const text = when(open.date, open.startMin, open.endMin);
  await notifyEmployees([employeeId], { title: "Du hast eine Schicht übernommen", body: text, link: `/mein-plan?w=${formatDateOnly(weekStart)}` }, { email: true });
  const others = open.bids.map((b) => b.employeeId).filter((id) => id !== employeeId);
  if (others.length) await notifyEmployees(others, { title: "Offene Schicht wurde vergeben", body: text, link: "/mein-plan" });
  if (open.offeredById) {
    await notifyEmployees([open.offeredById], {
      title: `${emp.firstName} übernimmt deine Schicht`,
      body: text,
      link: `/mein-plan?w=${formatDateOnly(weekStart)}`,
    });
  }
  await audit(user.id, "assign", "OpenShift", open.id, { employeeId });
  revalidate();
  return { ok: true, message: `${emp.firstName} ${emp.lastName} übernimmt die Schicht` };
}

export async function cancelOpenShift(openShiftId: string): Promise<ActionResult> {
  const user = await requireUser();
  const open = await db.openShift.findUnique({ where: { id: openShiftId }, include: { bids: true } });
  if (!open || open.status !== "OPEN") return fail("Die Schicht ist nicht mehr offen");
  const own = !!user.employeeId && open.offeredById === user.employeeId;
  if (!own && !isPlanner(user.role)) return fail("Keine Berechtigung");
  await db.openShift.update({ where: { id: open.id }, data: { status: "CANCELLED", decidedAt: new Date() } });
  if (open.bids.length) {
    await notifyEmployees(
      open.bids.map((b) => b.employeeId),
      { title: "Offene Schicht zurückgezogen", body: when(open.date, open.startMin, open.endMin), link: "/mein-plan" },
    );
  }
  await audit(user.id, "cancel", "OpenShift", open.id);
  revalidate();
  return { ok: true, message: "Aus der Börse genommen" };
}
