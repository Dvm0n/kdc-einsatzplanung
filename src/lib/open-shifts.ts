import { db } from "@/lib/db";
import type { SegmentDTO } from "@/lib/planning/types";
import { formatDateOnly } from "@/lib/time";

export interface OpenShiftDTO {
  id: string;
  date: string;
  startMin: number;
  endMin: number;
  segments: SegmentDTO[];
  note: string | null;
  /** abgebende Person (bei „an alle abgeben“), sonst von der Planung ausgeschrieben */
  offeredBy: { id: string; name: string } | null;
  sourceShiftId: string | null;
  bids: { employeeId: string; name: string; createdAt: string }[];
}

/** Offene Schichten im Zeitraum (inklusive) */
export async function loadOpenShifts(from: Date, to?: Date): Promise<OpenShiftDTO[]> {
  const rows = await db.openShift.findMany({
    where: { status: "OPEN", date: to ? { gte: from, lte: to } : { gte: from } },
    include: { offeredBy: true, bids: { include: { employee: true }, orderBy: { createdAt: "asc" } } },
    orderBy: [{ date: "asc" }, { startMin: "asc" }],
  });
  return rows.map((o) => ({
    id: o.id,
    date: formatDateOnly(o.date),
    startMin: o.startMin,
    endMin: o.endMin,
    segments: (Array.isArray(o.segments) ? o.segments : []) as unknown as SegmentDTO[],
    note: o.note,
    offeredBy: o.offeredBy ? { id: o.offeredBy.id, name: `${o.offeredBy.firstName} ${o.offeredBy.lastName}` } : null,
    sourceShiftId: o.sourceShiftId,
    bids: o.bids.map((b) => ({
      employeeId: b.employeeId,
      name: `${b.employee.firstName} ${b.employee.lastName}`,
      createdAt: b.createdAt.toISOString(),
    })),
  }));
}
