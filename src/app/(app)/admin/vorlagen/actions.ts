"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, fail, zodMessage } from "@/lib/action-result";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

const templateSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(1, "Name fehlt"),
    startMin: z.number().int().min(0).max(1440),
    endMin: z.number().int().min(0).max(1440),
    activityTypeId: z.string().min(1),
  })
  .refine((t) => t.endMin > t.startMin, "Ende muss nach dem Beginn liegen");

export async function saveTemplate(input: z.input<typeof templateSchema>): Promise<ActionResult> {
  const admin = await requireAdmin();
  const p = templateSchema.safeParse(input);
  if (!p.success) return fail(zodMessage(p.error));
  const { id, ...data } = p.data;
  if (id) await db.shiftTemplate.update({ where: { id }, data });
  else await db.shiftTemplate.create({ data: { ...data, sortOrder: await db.shiftTemplate.count() } });
  await audit(admin.id, id ? "update" : "create", "ShiftTemplate", id ?? null, data);
  revalidatePath("/admin/vorlagen");
  return { ok: true, message: "Vorlage gespeichert" };
}

export async function deleteTemplate(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  await db.shiftTemplate.delete({ where: { id } });
  await audit(admin.id, "delete", "ShiftTemplate", id);
  revalidatePath("/admin/vorlagen");
  return { ok: true, message: "Vorlage gelöscht" };
}

const activitySchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name fehlt"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Ungültige Farbe"),
  isPhoneTime: z.boolean(),
  isWorkTime: z.boolean(),
  isBreak: z.boolean(),
});

export async function saveActivity(input: z.input<typeof activitySchema>): Promise<ActionResult> {
  const admin = await requireAdmin();
  const p = activitySchema.safeParse(input);
  if (!p.success) return fail(zodMessage(p.error));
  const { id, ...data } = p.data;
  if (id) {
    await db.activityType.update({ where: { id }, data });
  } else {
    const key = data.name.toUpperCase().replace(/[^A-Z0-9]+/g, "_") + "_" + Date.now().toString(36).toUpperCase();
    await db.activityType.create({ data: { ...data, key, sortOrder: await db.activityType.count() } });
  }
  await audit(admin.id, id ? "update" : "create", "ActivityType", id ?? null, data);
  revalidatePath("/admin/vorlagen");
  revalidatePath("/plan");
  return { ok: true, message: "Aktivität gespeichert" };
}
