import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { requirePlanner } from "@/lib/session";
import { formatDateOnly, minToHHMM } from "@/lib/time";
import { RecordAbsence } from "./record-absence";
import { RequestInbox, type InboxItem } from "./request-inbox";

export default async function RequestsPage() {
  await requirePlanner();
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [changes, absences, employees, activities] = await Promise.all([
    db.changeRequest.findMany({
      where: { OR: [{ status: { in: ["PENDING", "PEER_ACCEPTED"] } }, { decidedAt: { gte: since } }] },
      include: { requester: true, swapPartner: true, shift: true },
      orderBy: { createdAt: "desc" },
    }),
    db.absenceRequest.findMany({
      where: { OR: [{ status: "PENDING" }, { decidedAt: { gte: since } }] },
      include: { employee: true },
      orderBy: { createdAt: "desc" },
    }),
    db.employee.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.activityType.findMany({ select: { id: true, name: true } }),
  ]);

  const actName = Object.fromEntries(activities.map((a) => [a.id, a.name]));

  // Überschneidende Abwesenheiten anderer (für die Entscheidung hilfreich)
  const approvedAbsences = await db.absenceRequest.findMany({ where: { status: "APPROVED" }, include: { employee: true } });

  const items: InboxItem[] = [
    ...changes.map(
      (c): InboxItem => ({
        kind: "change",
        id: c.id,
        type: c.type,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
        employee: `${c.requester.firstName} ${c.requester.lastName}`,
        color: c.requester.color,
        date: c.shift ? formatDateOnly(c.shift.date) : c.proposedDate ? formatDateOnly(c.proposedDate) : null,
        endDate: null,
        shiftStart: c.shift?.startMin ?? null,
        shiftEnd: c.shift?.endMin ?? null,
        proposedStart: c.proposedStart,
        proposedEnd: c.proposedEnd,
        proposedDetail: Array.isArray(c.proposedSegments)
          ? (c.proposedSegments as { activityTypeId: string; startMin: number; endMin: number }[])
              .map((s) => `${actName[s.activityTypeId] ?? "?"} ${minToHHMM(s.startMin)}–${minToHHMM(s.endMin)}`)
              .join(" · ")
          : null,
        partner: c.swapPartner ? `${c.swapPartner.firstName} ${c.swapPartner.lastName}` : null,
        comment: c.comment,
        adminComment: c.adminComment,
        // offene Tauschanfragen ohne Zusage des Kollegen kann die Planung erst nach Zusage genehmigen
        actionable: c.type === "SWAP" ? c.status === "PEER_ACCEPTED" : c.status === "PENDING",
        overlaps: [],
      }),
    ),
    ...absences.map(
      (a): InboxItem => ({
        kind: "absence",
        id: a.id,
        type: a.kind,
        status: a.status,
        createdAt: a.createdAt.toISOString(),
        employee: `${a.employee.firstName} ${a.employee.lastName}`,
        color: a.employee.color,
        date: formatDateOnly(a.startDate),
        endDate: formatDateOnly(a.endDate),
        shiftStart: null,
        shiftEnd: null,
        proposedStart: null,
        proposedEnd: null,
        proposedDetail: null,
        partner: null,
        comment: a.comment,
        adminComment: a.adminComment,
        actionable: a.status === "PENDING",
        overlaps: approvedAbsences
          .filter((o) => o.employeeId !== a.employeeId && o.startDate <= a.endDate && o.endDate >= a.startDate)
          .map((o) => o.employee.firstName),
      }),
    ),
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Anträge"
        description="Änderungswünsche, Schichttausch und Urlaub. Genehmigte Änderungen werden direkt in den Plan übernommen."
        actions={<RecordAbsence employees={employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}` }))} />}
      />
      <RequestInbox items={items} />
    </div>
  );
}
