import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatDateOnly, toDateOnly } from "@/lib/time";
import { HolidaysCard } from "./holidays-card";
import { ParametersCard } from "./parameters-card";
import { ServiceHoursCard } from "./service-hours-card";

export default async function SettingsPage() {
  const [settings, hours, holidays] = await Promise.all([
    getSettings(),
    db.serviceHours.findMany({ orderBy: [{ weekday: "asc" }, { startMin: "asc" }] }),
    db.holiday.findMany({ where: { date: { gte: toDateOnly(new Date()) } }, orderBy: { date: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <ServiceHoursCard initial={hours.map(({ weekday, startMin, endMin }) => ({ weekday, startMin, endMin }))} />
      <ParametersCard
        initial={{
          intervalMinutes: settings.intervalMinutes,
          serviceLevelTarget: Math.round(settings.serviceLevelTarget * 100),
          serviceLevelSeconds: settings.serviceLevelSeconds,
          maxOccupancy: Math.round(settings.maxOccupancy * 100),
          shrinkage: Math.round(settings.shrinkage * 100),
          forecastWeeks: settings.forecastWeeks,
          wishDeadlineWeekday: settings.wishDeadlineWeekday,
          wishDeadlineHour: settings.wishDeadlineHour,
          federalState: settings.federalState,
        }}
      />
      <HolidaysCard
        holidays={holidays.map((h) => ({
          id: h.id,
          date: formatDateOnly(h.date),
          name: h.name,
          closed: h.closed,
          startMin: h.startMin,
          endMin: h.endMin,
        }))}
      />
    </div>
  );
}
