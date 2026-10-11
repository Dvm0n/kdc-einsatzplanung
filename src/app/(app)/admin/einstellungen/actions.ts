"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, fail, zodMessage } from "@/lib/action-result";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { FEDERAL_STATES, holidaysFor } from "@/lib/holidays";
import { requireAdmin } from "@/lib/session";
import { parseDateOnly } from "@/lib/time";

const paramsSchema = z.object({
  intervalMinutes: z.coerce.number().refine((v) => v === 15 || v === 30 || v === 60, "Intervall: 15, 30 oder 60 Minuten"),
  serviceLevelTarget: z.coerce.number().min(1).max(100),
  serviceLevelSeconds: z.coerce.number().int().min(1).max(600),
  maxOccupancy: z.coerce.number().min(50).max(100),
  shrinkage: z.coerce.number().min(0).max(80),
  forecastWeeks: z.coerce.number().int().min(1).max(52),
  wishDeadlineWeekday: z.coerce.number().int().min(1).max(7),
  wishDeadlineHour: z.coerce.number().int().min(0).max(23),
  federalState: z.string().refine((s) => s in FEDERAL_STATES, "Unbekanntes Bundesland"),
});

export type ParamsInput = z.input<typeof paramsSchema>;

export async function saveParameters(input: ParamsInput): Promise<ActionResult> {
  const admin = await requireAdmin();
  const p = paramsSchema.safeParse(input);
  if (!p.success) return fail(zodMessage(p.error));
  const data = {
    ...p.data,
    serviceLevelTarget: p.data.serviceLevelTarget / 100,
    maxOccupancy: p.data.maxOccupancy / 100,
    shrinkage: p.data.shrinkage / 100,
  };
  await db.settings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  await audit(admin.id, "update", "Settings", "1", data);
  revalidatePath("/", "layout");
  return { ok: true, message: "Parameter gespeichert" };
}

const hoursSchema = z
  .array(
    z.object({
      weekday: z.number().int().min(1).max(7),
      startMin: z.number().int().min(0).max(1440),
      endMin: z.number().int().min(0).max(1440),
    }),
  )
  .refine((list) => list.every((w) => w.endMin > w.startMin), "Ende muss nach dem Beginn liegen");

export async function saveServiceHours(windows: z.input<typeof hoursSchema>): Promise<ActionResult> {
  const admin = await requireAdmin();
  const p = hoursSchema.safeParse(windows);
  if (!p.success) return fail(zodMessage(p.error));
  await db.$transaction([db.serviceHours.deleteMany(), db.serviceHours.createMany({ data: p.data })]);
  await audit(admin.id, "update", "ServiceHours", null, p.data);
  revalidatePath("/", "layout");
  return { ok: true, message: "Call-Zeiten gespeichert" };
}

export async function importHolidays(year: number): Promise<ActionResult> {
  const admin = await requireAdmin();
  const settings = await db.settings.findUnique({ where: { id: 1 } });
  const list = holidaysFor(year, settings?.federalState ?? "NW");
  for (const h of list) {
    await db.holiday.upsert({ where: { date: h.date }, update: { name: h.name }, create: { ...h, closed: true } });
  }
  await audit(admin.id, "import", "Holiday", String(year));
  revalidatePath("/admin/einstellungen");
  return { ok: true, message: `${list.length} Feiertage für ${year} übernommen` };
}

const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum fehlt"),
  name: z.string().trim().min(1, "Bezeichnung fehlt"),
  closed: z.boolean(),
  startMin: z.number().int().nullable(),
  endMin: z.number().int().nullable(),
});

export async function addHoliday(input: z.input<typeof holidaySchema>): Promise<ActionResult> {
  const admin = await requireAdmin();
  const p = holidaySchema.safeParse(input);
  if (!p.success) return fail(zodMessage(p.error));
  const date = parseDateOnly(p.data.date);
  const data = {
    name: p.data.name,
    closed: p.data.closed,
    startMin: p.data.closed ? null : p.data.startMin,
    endMin: p.data.closed ? null : p.data.endMin,
  };
  await db.holiday.upsert({ where: { date }, update: data, create: { date, ...data } });
  await audit(admin.id, "upsert", "Holiday", p.data.date, data);
  revalidatePath("/admin/einstellungen");
  return { ok: true, message: "Gespeichert" };
}

export async function deleteHoliday(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  await db.holiday.delete({ where: { id } });
  await audit(admin.id, "delete", "Holiday", id);
  revalidatePath("/admin/einstellungen");
  return { ok: true, message: "Entfernt" };
}
