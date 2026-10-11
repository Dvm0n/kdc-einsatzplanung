"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, fail } from "@/lib/action-result";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { ABSENCE_LABEL } from "@/lib/labels";
import { notifyEmployees } from "@/lib/notify";
import { buildSegments } from "@/lib/planning/shifts";
import { requirePlanner } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { fmtDay, formatDateOnly, minToHHMM, weekStartOf } from "@/lib/time";

function revalidateAll() {
  revalidatePath("/antraege");
  revalidatePath("/plan");
  revalidatePath("/mein-plan");
  revalidatePath("/verfuegbarkeit");
  revalidatePath("/", "layout");
}

async function bumpWeek(date: Date) {
  await db.scheduleWeek.updateMany({ where: { weekStart: weekStartOf(date), status: "PUBLISHED" }, data: { version: { increment: 1 } } });
}

export async function decideChange(id: string, approve: boolean, adminComment?: string): Promise<ActionResult> {
  const user = await requirePlanner();
  const req = await db.changeRequest.findUnique({
    where: { id },
    include: { shift: { include: { segments: true } }, requester: true, swapPartner: true },
  });
  if (!req) return fail("Antrag nicht gefunden");
  const open = req.type === "SWAP" ? req.status === "PEER_ACCEPTED" || req.status === "PENDING" : req.status === "PENDING";
  if (!open) return fail("Der Antrag wurde bereits bearbeitet");
  if (approve && req.type === "SWAP" && req.status !== "PEER_ACCEPTED") return fail("Die Kollegin / der Kollege hat noch nicht zugesagt");
  if (approve && !req.shift) return fail("Die Schicht existiert nicht mehr");

  const shift = req.shift;
  if (approve && shift) {
    if (req.type === "DAY_OFF") {
      await db.shift.delete({ where: { id: shift.id } });
    } else if (req.type === "CHANGE_TIME") {
      const start = req.proposedStart!;
      const end = req.proposedEnd!;
      const clash = await db.shift.findFirst({
        where: { employeeId: shift.employeeId, date: shift.date, id: { not: shift.id }, startMin: { lt: end }, endMin: { gt: start } },
      });
      if (clash) return fail("Die gewünschte Zeit überschneidet sich mit einer anderen Schicht");
      // Hauptaktivität der bisherigen Schicht übernehmen, Pausen neu setzen
      const acts = await db.activityType.findMany();
      const breakAct = acts.find((a) => a.isBreak);
      const durations = new Map<string, number>();
      for (const s of shift.segments) {
        if (acts.find((a) => a.id === s.activityTypeId)?.isBreak) continue;
        durations.set(s.activityTypeId, (durations.get(s.activityTypeId) ?? 0) + s.endMin - s.startMin);
      }
      const main = [...durations.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? acts[0].id;
      const settings = await getSettings();
      await db.$transaction([
        db.shiftSegment.deleteMany({ where: { shiftId: shift.id } }),
        db.shift.update({
          where: { id: shift.id },
          data: { startMin: start, endMin: end, segments: { create: buildSegments(start, end, main, breakAct?.id ?? null, settings) } },
        }),
      ]);
    } else if (req.type === "SWAP") {
      const clash = await db.shift.findFirst({
        where: { employeeId: req.swapPartnerId!, date: shift.date, startMin: { lt: shift.endMin }, endMin: { gt: shift.startMin } },
      });
      if (clash) return fail(`${req.swapPartner!.firstName} hat zu dieser Zeit inzwischen eine andere Schicht`);
      await db.shift.update({ where: { id: shift.id }, data: { employeeId: req.swapPartnerId! } });
    }
    await bumpWeek(shift.date);
  }

  await db.changeRequest.update({
    where: { id },
    data: { status: approve ? "APPROVED" : "REJECTED", adminComment: adminComment || null, decidedAt: new Date() },
  });

  const when = shift ? `${fmtDay(shift.date, "EEE dd.MM.")} ${minToHHMM(shift.startMin)}–${minToHHMM(shift.endMin)}` : "";
  const recipients = [req.requesterId, ...(req.type === "SWAP" && req.swapPartnerId ? [req.swapPartnerId] : [])];
  await notifyEmployees(
    recipients,
    {
      title: approve ? "Dein Antrag wurde genehmigt" : "Dein Antrag wurde abgelehnt",
      body: [when, adminComment].filter(Boolean).join(" · "),
      link: shift ? `/mein-plan?w=${formatDateOnly(weekStartOf(shift.date))}` : "/mein-plan",
    },
    { email: true },
  );
  await audit(user.id, approve ? "approve" : "reject", "ChangeRequest", id, { type: req.type });
  revalidateAll();
  return { ok: true, message: approve ? "Genehmigt – der Plan wurde angepasst" : "Abgelehnt" };
}

export async function decideAbsence(id: string, approve: boolean, adminComment?: string): Promise<ActionResult> {
  const user = await requirePlanner();
  const req = await db.absenceRequest.findUnique({ where: { id }, include: { employee: true } });
  if (!req) return fail("Antrag nicht gefunden");
  if (req.status !== "PENDING") return fail("Der Antrag wurde bereits bearbeitet");

  let removed = 0;
  if (approve) {
    const shifts = await db.shift.findMany({
      where: { employeeId: req.employeeId, date: { gte: req.startDate, lte: req.endDate } },
    });
    removed = shifts.length;
    if (removed) {
      await db.shift.deleteMany({ where: { id: { in: shifts.map((s) => s.id) } } });
      for (const s of shifts) await bumpWeek(s.date);
    }
  }
  await db.absenceRequest.update({
    where: { id },
    data: { status: approve ? "APPROVED" : "REJECTED", adminComment: adminComment || null, decidedAt: new Date() },
  });
  await notifyEmployees(
    [req.employeeId],
    {
      title: `${ABSENCE_LABEL[req.kind]} ${approve ? "genehmigt" : "abgelehnt"}`,
      body: [`${fmtDay(req.startDate, "dd.MM.yyyy")} – ${fmtDay(req.endDate, "dd.MM.yyyy")}`, adminComment].filter(Boolean).join(" · "),
      link: "/verfuegbarkeit",
    },
    { email: true },
  );
  await audit(user.id, approve ? "approve" : "reject", "AbsenceRequest", id, { removedShifts: removed });
  revalidateAll();
  return {
    ok: true,
    message: approve ? `Genehmigt${removed ? ` – ${removed} Schicht(en) im Zeitraum entfernt` : ""}` : "Abgelehnt",
  };
}

/** Planer trägt Abwesenheit (z. B. Krankmeldung) direkt ein */
export async function recordAbsence(input: {
  employeeId: string;
  kind: "VACATION" | "OFF" | "SICK" | "OTHER";
  startDate: string;
  endDate: string;
  comment?: string;
}): Promise<ActionResult> {
  await requirePlanner();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate) || input.endDate < input.startDate) {
    return fail("Ungültiger Zeitraum");
  }
  const req = await db.absenceRequest.create({
    data: {
      employeeId: input.employeeId,
      kind: input.kind,
      startDate: new Date(input.startDate + "T00:00:00Z"),
      endDate: new Date(input.endDate + "T00:00:00Z"),
      comment: input.comment || null,
    },
  });
  return decideAbsence(req.id, true, "Von der Planung eingetragen");
}
