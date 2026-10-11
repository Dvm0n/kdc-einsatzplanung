"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, fail, zodMessage } from "@/lib/action-result";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { notifyEmployees, notifyPlanners } from "@/lib/notify";
import { requireUser } from "@/lib/session";
import { fmtDay, minToHHMM, toDateOnly } from "@/lib/time";

const changeSchema = z
  .object({
    shiftId: z.string().min(1),
    type: z.enum(["CHANGE_TIME", "DAY_OFF", "SWAP"]),
    proposedStart: z.number().int().min(0).max(1440).nullable(),
    proposedEnd: z.number().int().min(0).max(1440).nullable(),
    swapPartnerId: z.string().nullable(),
    comment: z.string().trim().max(500).optional(),
  })
  .refine(
    (c) => c.type !== "CHANGE_TIME" || (c.proposedStart != null && c.proposedEnd != null && c.proposedEnd > c.proposedStart),
    "Bitte gültige Wunschzeiten angeben",
  )
  .refine((c) => c.type !== "SWAP" || !!c.swapPartnerId, "Bitte eine Kollegin / einen Kollegen auswählen");

export async function requestChange(input: z.input<typeof changeSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.employeeId) return fail("Kein Mitarbeiterprofil");
  const p = changeSchema.safeParse(input);
  if (!p.success) return fail(zodMessage(p.error));
  const c = p.data;

  const shift = await db.shift.findUnique({ where: { id: c.shiftId }, include: { week: true, employee: true } });
  if (!shift || shift.employeeId !== user.employeeId) return fail("Schicht nicht gefunden");
  if (shift.week.status !== "PUBLISHED") return fail("Die Woche ist noch nicht veröffentlicht");
  if (shift.date < toDateOnly(new Date())) return fail("Vergangene Schichten können nicht geändert werden");
  const open = await db.changeRequest.findFirst({
    where: { shiftId: c.shiftId, status: { in: ["PENDING", "PEER_ACCEPTED"] } },
  });
  if (open) return fail("Für diese Schicht gibt es bereits einen offenen Antrag");

  if (c.type === "SWAP") {
    const partner = await db.employee.findUnique({ where: { id: c.swapPartnerId! } });
    if (!partner?.active || partner.id === user.employeeId) return fail("Ungültige Kollegin / ungültiger Kollege");
    const clash = await db.shift.findFirst({
      where: { employeeId: partner.id, date: shift.date, startMin: { lt: shift.endMin }, endMin: { gt: shift.startMin } },
    });
    if (clash) return fail(`${partner.firstName} arbeitet zu dieser Zeit bereits`);
  }

  const req = await db.changeRequest.create({
    data: {
      type: c.type,
      requesterId: user.employeeId,
      shiftId: c.shiftId,
      proposedDate: shift.date,
      proposedStart: c.type === "CHANGE_TIME" ? c.proposedStart : null,
      proposedEnd: c.type === "CHANGE_TIME" ? c.proposedEnd : null,
      swapPartnerId: c.type === "SWAP" ? c.swapPartnerId : null,
      comment: c.comment || null,
    },
  });

  const when = `${fmtDay(shift.date, "EEE dd.MM.")} ${minToHHMM(shift.startMin)}–${minToHHMM(shift.endMin)}`;
  const name = `${shift.employee.firstName} ${shift.employee.lastName}`;
  if (c.type === "SWAP") {
    await notifyEmployees(
      [c.swapPartnerId!],
      { title: `${name} möchte dir eine Schicht übergeben`, body: when, link: "/mein-plan" },
      { email: true },
    );
  } else {
    await notifyPlanners({ title: `Änderungswunsch von ${name}`, body: when, link: "/antraege" });
  }
  await audit(user.id, "create", "ChangeRequest", req.id, { type: c.type });
  revalidatePath("/mein-plan");
  revalidatePath("/antraege");
  return {
    ok: true,
    message: c.type === "SWAP" ? "Anfrage an die Kollegin / den Kollegen gesendet" : "Antrag an die Planung gesendet",
  };
}

/** Kollege nimmt eine angebotene Schicht an (oder lehnt ab). Danach entscheidet die Planung. */
export async function respondToSwap(requestId: string, accept: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const req = await db.changeRequest.findUnique({
    where: { id: requestId },
    include: { requester: true, swapPartner: true, shift: true },
  });
  if (!req || req.type !== "SWAP" || req.swapPartnerId !== user.employeeId) return fail("Anfrage nicht gefunden");
  if (req.status !== "PENDING") return fail("Die Anfrage wurde bereits bearbeitet");

  await db.changeRequest.update({ where: { id: requestId }, data: { status: accept ? "PEER_ACCEPTED" : "REJECTED", decidedAt: accept ? null : new Date() } });
  const partner = `${req.swapPartner!.firstName} ${req.swapPartner!.lastName}`;
  if (accept) {
    await notifyPlanners({
      title: `Schichttausch zur Freigabe: ${req.requester.firstName} → ${req.swapPartner!.firstName}`,
      body: req.shift ? `${fmtDay(req.shift.date, "EEE dd.MM.")} ${minToHHMM(req.shift.startMin)}–${minToHHMM(req.shift.endMin)}` : undefined,
      link: "/antraege",
    });
  }
  await notifyEmployees([req.requesterId], {
    title: accept ? `${partner} übernimmt deine Schicht – wartet auf Freigabe` : `${partner} kann deine Schicht nicht übernehmen`,
    link: "/mein-plan",
  });
  await audit(user.id, accept ? "accept" : "decline", "ChangeRequest", requestId);
  revalidatePath("/mein-plan");
  revalidatePath("/antraege");
  return { ok: true, message: accept ? "Zugesagt – die Planung gibt den Tausch noch frei" : "Abgelehnt" };
}

export async function cancelChange(requestId: string): Promise<ActionResult> {
  const user = await requireUser();
  const r = await db.changeRequest.updateMany({
    where: { id: requestId, requesterId: user.employeeId ?? "-", status: { in: ["PENDING", "PEER_ACCEPTED"] } },
    data: { status: "CANCELLED" },
  });
  if (r.count === 0) return fail("Antrag kann nicht mehr zurückgezogen werden");
  await audit(user.id, "cancel", "ChangeRequest", requestId);
  revalidatePath("/mein-plan");
  revalidatePath("/antraege");
  return { ok: true, message: "Antrag zurückgezogen" };
}

export async function markNotificationsRead(): Promise<ActionResult> {
  const user = await requireUser();
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
  return { ok: true };
}
