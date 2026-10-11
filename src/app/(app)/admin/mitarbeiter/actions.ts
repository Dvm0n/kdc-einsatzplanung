"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, fail, zodMessage } from "@/lib/action-result";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { requireAdmin } from "@/lib/session";

const employeeSchema = z.object({
  id: z.string().optional(),
  firstName: z.string().trim().min(1, "Vorname fehlt"),
  lastName: z.string().trim().min(1, "Nachname fehlt"),
  email: z.string().trim().toLowerCase().email("Ungültige E-Mail-Adresse"),
  role: z.enum(["ADMIN", "TEAMLEAD", "OPERATOR"]),
  contractType: z.enum(["FULLTIME", "PARTTIME", "MINIJOB"]),
  weeklyHours: z.coerce.number().min(0).max(48, "Max. 48 Wochenstunden"),
  maxHoursPerDay: z.coerce.number().min(1).max(10, "Max. 10 Stunden pro Tag (ArbZG)"),
  skills: z.array(z.enum(["INBOUND", "OUTBOUND"])).min(1, "Mindestens ein Skill"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export type EmployeeInput = z.input<typeof employeeSchema>;

function inviteUrl(token: string) {
  return `${process.env.APP_URL ?? "http://localhost:3000"}/einladung/${token}`;
}

function newInvite() {
  return { inviteToken: randomBytes(24).toString("base64url"), inviteExpires: new Date(Date.now() + 7 * 86_400_000) };
}

export async function saveEmployee(input: EmployeeInput): Promise<ActionResult<{ inviteUrl?: string }>> {
  const admin = await requireAdmin();
  const parsed = employeeSchema.safeParse(input);
  if (!parsed.success) return fail(zodMessage(parsed.error));
  const { id, email, role, ...emp } = parsed.data;

  const existingUser = await db.user.findUnique({ where: { email }, include: { employee: true } });

  if (id) {
    const current = await db.employee.findUnique({ where: { id }, include: { user: true } });
    if (!current) return fail("Mitarbeiter nicht gefunden");
    if (existingUser && existingUser.id !== current.userId) return fail("E-Mail wird bereits verwendet");
    await db.$transaction(async (tx) => {
      await tx.employee.update({ where: { id }, data: emp });
      if (current.userId) {
        await tx.user.update({ where: { id: current.userId }, data: { email, role } });
      }
    });
    await audit(admin.id, "update", "Employee", id, { ...emp, email, role });
    revalidatePath("/admin/mitarbeiter");
    return { ok: true, message: "Gespeichert" };
  }

  if (existingUser) return fail("E-Mail wird bereits verwendet");
  const invite = newInvite();
  const count = await db.employee.count();
  const created = await db.user.create({
    data: { email, role, ...invite, employee: { create: { ...emp, sortOrder: count } } },
    include: { employee: true },
  });
  const url = inviteUrl(invite.inviteToken);
  await sendMail({
    to: email,
    subject: "Einladung zur KDC-Einsatzplanung",
    text: `Hallo ${emp.firstName},\n\ndu wurdest zur KDC-Einsatzplanung eingeladen. Lege hier dein Passwort fest (7 Tage gültig):\n${url}`,
  });
  await audit(admin.id, "create", "Employee", created.employee?.id, { ...emp, email, role });
  revalidatePath("/admin/mitarbeiter");
  return { ok: true, message: "Mitarbeiter angelegt und eingeladen", data: { inviteUrl: url } };
}

export async function resendInvite(employeeId: string): Promise<ActionResult<{ inviteUrl: string }>> {
  const admin = await requireAdmin();
  const emp = await db.employee.findUnique({ where: { id: employeeId }, include: { user: true } });
  if (!emp?.user) return fail("Kein Benutzerkonto vorhanden");
  const invite = newInvite();
  await db.user.update({ where: { id: emp.user.id }, data: invite });
  const url = inviteUrl(invite.inviteToken);
  await sendMail({
    to: emp.user.email,
    subject: "Einladung zur KDC-Einsatzplanung",
    text: `Hallo ${emp.firstName},\n\nhier ist dein Link zum Festlegen des Passworts (7 Tage gültig):\n${url}`,
  });
  await audit(admin.id, "invite", "Employee", employeeId);
  return { ok: true, message: "Einladung versendet", data: { inviteUrl: url } };
}

export async function setEmployeeActive(employeeId: string, active: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  const emp = await db.employee.update({ where: { id: employeeId }, data: { active } });
  if (emp.userId) await db.user.update({ where: { id: emp.userId }, data: { active } });
  await audit(admin.id, active ? "activate" : "deactivate", "Employee", employeeId);
  revalidatePath("/admin/mitarbeiter");
  return { ok: true, message: active ? "Aktiviert" : "Deaktiviert" };
}
