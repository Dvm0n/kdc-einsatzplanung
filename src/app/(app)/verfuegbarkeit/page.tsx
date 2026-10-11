import { redirect } from "next/navigation";
import { TZDate } from "@date-fns/tz";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { addDaysUTC, fmtDay, formatDateOnly, isoWeekNumber, toDateOnly, WEEKDAY_NAMES, weekStartOf } from "@/lib/time";
import { AbsenceCard } from "./absence-card";
import { ExceptionsCard } from "./exceptions-card";
import { RecurringCard } from "./recurring-card";

export default async function AvailabilityPage() {
  const user = await requireUser();
  if (!user.employeeId) redirect("/plan");
  const today = toDateOnly(new Date());
  const [settings, rows, absences] = await Promise.all([
    getSettings(),
    db.availability.findMany({
      where: { employeeId: user.employeeId, OR: [{ date: null }, { date: { gte: today } }] },
      orderBy: [{ date: "asc" }, { weekday: "asc" }, { startMin: "asc" }],
    }),
    db.absenceRequest.findMany({
      where: { employeeId: user.employeeId, endDate: { gte: addDaysUTC(today, -60) } },
      orderBy: { startDate: "desc" },
    }),
  ]);

  // nächste Woche, für die noch Wünsche abgegeben werden können
  let target = addDaysUTC(weekStartOf(today), 7);
  const deadlineFor = (ws: Date) => {
    const d = addDaysUTC(ws, -7 + settings.wishDeadlineWeekday - 1);
    return new Date(
      new TZDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), settings.wishDeadlineHour, 0, 0, "Europe/Berlin").getTime(),
    );
  };
  if (deadlineFor(target) < new Date()) target = addDaysUTC(target, 7);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Verfügbarkeit & Urlaub"
        description={
          <>
            Wünsche für <span className="font-medium text-foreground">KW {isoWeekNumber(target)}</span> bitte bis{" "}
            <span className="font-medium text-foreground">
              {WEEKDAY_NAMES[settings.wishDeadlineWeekday - 1]}, {fmtDay(addDaysUTC(target, -7 + settings.wishDeadlineWeekday - 1), "dd.MM.")}{" "}
              {settings.wishDeadlineHour}:00 Uhr
            </span>{" "}
            eintragen.
          </>
        }
      />
      <RecurringCard
        initial={rows
          .filter((r) => r.weekday != null)
          .map((r) => ({ weekday: r.weekday!, startMin: r.startMin, endMin: r.endMin, kind: r.kind }))}
      />
      <ExceptionsCard
        items={rows
          .filter((r) => r.date != null)
          .map((r) => ({ id: r.id, date: formatDateOnly(r.date!), startMin: r.startMin, endMin: r.endMin, kind: r.kind, note: r.note }))}
      />
      <AbsenceCard
        items={absences.map((a) => ({
          id: a.id,
          kind: a.kind,
          startDate: formatDateOnly(a.startDate),
          endDate: formatDateOnly(a.endDate),
          status: a.status,
          comment: a.comment,
          adminComment: a.adminComment,
        }))}
      />
    </div>
  );
}
