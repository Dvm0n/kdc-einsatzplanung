import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { isPlanner } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Leichtgewichtiger Abgleich für die automatische Aktualisierung:
 * neue Benachrichtigungen seit `since` und Zähler für Glocke und Antrags-Badge.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = session.user;
  const sinceParam = new URL(req.url).searchParams.get("since");
  const since = sinceParam && !Number.isNaN(Date.parse(sinceParam)) ? new Date(sinceParam) : new Date(Date.now() - 60_000);
  const planner = isPlanner(user.role);

  const [fresh, unread, changes, absences, swaps, bids] = await Promise.all([
    db.notification.findMany({
      where: { userId: user.id, createdAt: { gt: since } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, title: true, body: true, link: true, createdAt: true },
    }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    planner ? db.changeRequest.count({ where: { status: { in: ["PENDING", "PEER_ACCEPTED"] }, type: { not: "SWAP" } } }) : 0,
    planner ? db.absenceRequest.count({ where: { status: "PENDING" } }) : 0,
    planner ? db.changeRequest.count({ where: { status: "PEER_ACCEPTED", type: "SWAP" } }) : 0,
    // Schichtbörse: offene Schichten mit Meldungen warten auf Zuteilung
    planner ? db.openShift.count({ where: { status: "OPEN", bids: { some: {} } } }) : 0,
  ]);

  return NextResponse.json(
    {
      now: new Date().toISOString(),
      unread,
      pending: changes + absences + swaps + bids,
      fresh: fresh.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
