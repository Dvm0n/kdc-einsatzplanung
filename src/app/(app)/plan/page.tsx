import { EmptyState } from "@/components/page-header";
import { Planner } from "@/components/planner/planner";
import { computeWeekDemand, loadDemandInputs } from "@/lib/demand";
import { loadWeek } from "@/lib/schedule";
import { isPlanner, requireUser } from "@/lib/session";
import { fmtWeekRange, formatDateOnly, isoWeekNumber, parseDateOnly, toDateOnly, weekStartOf } from "@/lib/time";

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; view?: string; d?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const planner = isPlanner(user.role);

  const today = toDateOnly(new Date());
  const weekStart = weekStartOf(sp.w && /^\d{4}-\d{2}-\d{2}$/.test(sp.w) ? parseDateOnly(sp.w) : today);
  // Wochenplan und Bedarfsdaten gleichzeitig laden
  const [data, demandInputs] = await Promise.all([
    loadWeek(weekStart, { withWarnings: planner }),
    planner ? loadDemandInputs(weekStart) : null,
  ]);

  const view = sp.view === "day" ? "day" : "week";
  const day = sp.d && data.days.includes(sp.d) ? sp.d : data.days.includes(formatDateOnly(today)) ? formatDateOnly(today) : data.days[0];

  if (!planner && data.status !== "PUBLISHED") {
    return (
      <div className="space-y-6">
        <Planner data={{ ...data, shifts: [], absences: [] }} canEdit={false} view={view} day={day} />
        <EmptyState title={`KW ${isoWeekNumber(weekStart)} ist noch nicht veröffentlicht`}>
          Der Plan für {fmtWeekRange(weekStart)} wird gerade erstellt. Du wirst benachrichtigt, sobald er verfügbar ist.
        </EmptyState>
      </div>
    );
  }

  const demand = demandInputs
    ? (await computeWeekDemand(weekStart, data.shifts, data.activities, demandInputs)).days
    : undefined;

  return (
    <Planner
      data={data}
      canEdit={planner}
      view={view}
      day={day}
      highlightEmployeeId={user.employeeId}
      demand={demand}
    />
  );
}
