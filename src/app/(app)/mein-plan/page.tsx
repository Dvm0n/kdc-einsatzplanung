import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { workMinutes } from "@/lib/planning/shifts";
import { loadWeek } from "@/lib/schedule";
import { requireUser } from "@/lib/session";
import {
  addDaysUTC,
  fmtWeekRange,
  formatDateOnly,
  isoWeekNumber,
  parseDateOnly,
  toDateOnly,
  weekStartOf,
} from "@/lib/time";
import { MyRequests, type MyRequest } from "./my-requests";
import { MyTimeline, type PendingProposal } from "./my-timeline";
import { SwapOffers, type SwapOffer } from "./swap-offers";

export default async function MyPlanPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const user = await requireUser();
  if (!user.employeeId) redirect("/plan");
  const sp = await searchParams;
  const weekStart = weekStartOf(sp.w && /^\d{4}-\d{2}-\d{2}$/.test(sp.w) ? parseDateOnly(sp.w) : toDateOnly(new Date()));
  const employeeId = user.employeeId;
  const [data, me, offers, requests] = await Promise.all([
    loadWeek(weekStart, { withWarnings: true }),
    db.employee.findUniqueOrThrow({ where: { id: employeeId } }),
    db.changeRequest.findMany({
      where: { type: "SWAP", swapPartnerId: employeeId, status: "PENDING" },
      include: { requester: true, shift: true },
      orderBy: { createdAt: "desc" },
    }),
    db.changeRequest.findMany({
      where: { requesterId: employeeId },
      include: { shift: true, swapPartner: true },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);

  const published = data.status === "PUBLISHED";
  const myShifts = published ? data.shifts.filter((s) => s.employeeId === me.id) : [];
  const acts = Object.fromEntries(data.activities.map((a) => [a.id, a]));
  const planned = myShifts.reduce((s, sh) => s + workMinutes(sh.segments, acts), 0);
  const pendingProposals: PendingProposal[] = requests
    .filter((r) => r.shiftId && (r.status === "PENDING" || r.status === "PEER_ACCEPTED"))
    .map((r) => ({
      shiftId: r.shiftId!,
      type: r.type,
      proposedStart: r.proposedStart,
      proposedEnd: r.proposedEnd,
      proposedSegments: Array.isArray(r.proposedSegments) ? (r.proposedSegments as unknown as PendingProposal["proposedSegments"]) : null,
    }));

  const colleagues = data.employees
    .filter((e) => e.id !== me.id)
    .map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}` }));
  const today = formatDateOnly(toDateOnly(new Date()));

  const nav = (delta: number) => `/mein-plan?w=${formatDateOnly(addDaysUTC(weekStart, delta * 7))}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hallo {me.firstName}</h1>
          <p className="text-sm text-muted-foreground">
            KW {isoWeekNumber(weekStart)} · {fmtWeekRange(weekStart)}
          </p>
        </div>
        <div className="flex items-center rounded-lg border bg-card">
          <Button variant="ghost" size="icon" asChild aria-label="Vorherige Woche">
            <Link href={nav(-1)}>
              <ChevronLeft />
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/mein-plan">Heute</Link>
          </Button>
          <Button variant="ghost" size="icon" asChild aria-label="Nächste Woche">
            <Link href={nav(1)}>
              <ChevronRight />
            </Link>
          </Button>
        </div>
      </div>

      {offers.length > 0 && (
        <SwapOffers
          offers={offers.map(
            (o): SwapOffer => ({
              id: o.id,
              from: `${o.requester.firstName} ${o.requester.lastName}`,
              date: o.shift ? formatDateOnly(o.shift.date) : null,
              startMin: o.shift?.startMin ?? null,
              endMin: o.shift?.endMin ?? null,
              comment: o.comment,
            }),
          )}
        />
      )}

      {published ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border bg-card p-4">
              <div className="text-xs text-muted-foreground">Geplant</div>
              <div className="text-xl font-semibold tabular-nums">
                {(planned / 60).toLocaleString("de-DE", { maximumFractionDigits: 1 })} h
              </div>
              <div className="text-xs text-muted-foreground">
                Soll {me.weeklyHours.toLocaleString("de-DE")} h
              </div>
            </div>
            <div className="rounded-2xl border bg-card p-4">
              <div className="text-xs text-muted-foreground">Schichten</div>
              <div className="text-xl font-semibold tabular-nums">{myShifts.length}</div>
              <div className="text-xs text-muted-foreground">
                {data.version > 1 ? <Badge variant="outline">Version {data.version}</Badge> : "veröffentlicht"}
              </div>
            </div>
          </div>
          <MyTimeline
            me={data.employees.find((e) => e.id === me.id) ?? {
              id: me.id,
              firstName: me.firstName,
              lastName: me.lastName,
              color: me.color,
              contractType: me.contractType,
              weeklyHours: me.weeklyHours,
              maxHoursPerDay: me.maxHoursPerDay,
              skills: me.skills,
            }}
            days={data.days}
            shifts={myShifts}
            activities={data.activities}
            absences={data.absences.filter((a) => a.employeeId === me.id)}
            holidays={data.holidays}
            serviceHours={data.serviceHours}
            pending={pendingProposals}
            colleagues={colleagues}
            today={today}
            rules={
              data.rules && {
                // nur eigene Daten an den Browser geben
                unavailable: data.rules.unavailable.filter((u) => u.employeeId === me.id),
                previousShifts: data.rules.previousShifts.filter((s) => s.employeeId === me.id),
                closedDates: data.rules.closedDates,
                settings: data.rules.settings,
              }
            }
          />
        </>
      ) : (
        <EmptyState title="Noch nicht veröffentlicht">
          Der Plan für diese Woche wird gerade erstellt. Du bekommst eine Benachrichtigung, sobald er da ist.
        </EmptyState>
      )}

      <MyRequests
        requests={requests.map(
          (r): MyRequest => ({
            id: r.id,
            type: r.type,
            status: r.status,
            date: r.shift ? formatDateOnly(r.shift.date) : r.proposedDate ? formatDateOnly(r.proposedDate) : null,
            shiftStart: r.shift?.startMin ?? null,
            shiftEnd: r.shift?.endMin ?? null,
            proposedStart: r.proposedStart,
            proposedEnd: r.proposedEnd,
            partner: r.swapPartner ? `${r.swapPartner.firstName} ${r.swapPartner.lastName}` : null,
            adminComment: r.adminComment,
          }),
        )}
      />
    </div>
  );
}
