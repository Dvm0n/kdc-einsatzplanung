"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, fail, zodMessage } from "@/lib/action-result";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { ABSENCE_LABEL } from "@/lib/labels";
import { notifyPlanners } from "@/lib/notify";
import { requireUser } from "@/lib/session";
import { fmtDay, parseDateOnly, toDateOnly } from "@/lib/time";

async function requireEmployee() {
  const user = await requireUser();
  if (!user.employeeId) throw new Error("Kein Mitarbeiterprofil");
  return { user, employeeId: user.employeeId };
}

const windowSchema = z
  .object({
    weekday: z.number().int().min(1).max(7).nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    startMin: z.number().int().min(0).max(1440),
    endMin: z.number().int().min(0).max(1440),
    kind: z.enum(["AVAILABLE", "PREFERRED", "UNAVAILABLE"]),
    note: z.string().trim().max(200).nullable().optional(),
  })
  .refine((w) => w.endMin > w.startMin, "Ende muss nach dem Beginn liegen")
  .refine((w) => (w.weekday == null) !== (w.date == null), "Wochentag oder Datum angeben");

/** Ersetzt die wiederkehrende Wochenverfügbarkeit */
export async function saveRecurringAvailability(windows: z.input<typeof windowSchema>[]): Promise<ActionResult> {
  const { user, employeeId } = await requireEmployee();
  const p = z.array(windowSchema).safeParse(windows);
  if (!p.success) return fail(zodMessage(p.error));
  if (p.data.some((w) => w.weekday == null)) return fail("Ungültige Daten");
  await db.$transaction([
    db.availability.deleteMany({ where: { employeeId, date: null } }),
    db.availability.createMany({
      data: p.data.map((w) => ({ employeeId, weekday: w.weekday, startMin: w.startMin, endMin: w.endMin, kind: w.kind, note: w.note ?? null })),
    }),
  ]);
  await audit(user.id, "update", "Availability", employeeId);
  revalidatePath("/verfuegbarkeit");
  return { ok: true, message: "Verfügbarkeit gespeichert" };
}

export async function addAvailabilityException(input: z.input<typeof windowSchema>): Promise<ActionResult> {
  const { user, employeeId } = await requireEmployee();
  const p = windowSchema.safeParse(input);
  if (!p.success) return fail(zodMessage(p.error));
  if (!p.data.date) return fail("Datum fehlt");
  const date = parseDateOnly(p.data.date);
  if (date < toDateOnly(new Date())) return fail("Das Datum liegt in der Vergangenheit");
  await db.availability.create({
    data: { employeeId, date, startMin: p.data.startMin, endMin: p.data.endMin, kind: p.data.kind, note: p.data.note ?? null },
  });
  await audit(user.id, "create", "Availability", employeeId, { date: p.data.date });
  revalidatePath("/verfuegbarkeit");
  return { ok: true, message: "Eintrag gespeichert" };
}

export async function deleteAvailability(id: string): Promise<ActionResult> {
  const { employeeId } = await requireEmployee();
  await db.availability.deleteMany({ where: { id, employeeId } });
  revalidatePath("/verfuegbarkeit");
  return { ok: true, message: "Entfernt" };
}

const absenceSchema = z
  .object({
    kind: z.enum(["VACATION", "OFF", "OTHER"]),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Startdatum fehlt"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enddatum fehlt"),
    comment: z.string().trim().max(500).optional(),
  })
  .refine((a) => a.endDate >= a.startDate, "Das Enddatum liegt vor dem Startdatum");

export async function requestAbsence(input: z.input<typeof absenceSchema>): Promise<ActionResult> {
  const { user, employeeId } = await requireEmployee();
  const p = absenceSchema.safeParse(input);
  if (!p.success) return fail(zodMessage(p.error));
  const start = parseDateOnly(p.data.startDate);
  const end = parseDateOnly(p.data.endDate);
  const overlap = await db.absenceRequest.findFirst({
    where: { employeeId, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: end }, endDate: { gte: start } },
  });
  if (overlap) return fail("Für diesen Zeitraum gibt es bereits einen Antrag");
  const req = await db.absenceRequest.create({
    data: { employeeId, kind: p.data.kind, startDate: start, endDate: end, comment: p.data.comment || null },
    include: { employee: true },
  });
  await notifyPlanners({
    title: `${ABSENCE_LABEL[p.data.kind]}santrag von ${req.employee.firstName} ${req.employee.lastName}`,
    body: `${fmtDay(start, "dd.MM.yyyy")} – ${fmtDay(end, "dd.MM.yyyy")}`,
    link: "/antraege",
  });
  await audit(user.id, "create", "AbsenceRequest", req.id);
  revalidatePath("/verfuegbarkeit");
  revalidatePath("/antraege");
  return { ok: true, message: "Antrag gestellt" };
}

export async function cancelAbsence(id: string): Promise<ActionResult> {
  const { user, employeeId } = await requireEmployee();
  const r = await db.absenceRequest.updateMany({
    where: { id, employeeId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  if (r.count === 0) return fail("Nur offene Anträge können zurückgezogen werden");
  await audit(user.id, "cancel", "AbsenceRequest", id);
  revalidatePath("/verfuegbarkeit");
  revalidatePath("/antraege");
  return { ok: true, message: "Antrag zurückgezogen" };
}
