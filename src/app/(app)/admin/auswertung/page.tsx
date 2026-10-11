import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";

const h = (m: number) => (m / 60).toLocaleString("de-DE", { maximumFractionDigits: 1 });

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const now = new Date();
  const [y, mo] = sp.m && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const from = new Date(Date.UTC(y, mo - 1, 1));
  const to = new Date(Date.UTC(y, mo, 0));
  const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const prev = monthKey(new Date(Date.UTC(y, mo - 2, 1)));
  const next = monthKey(new Date(Date.UTC(y, mo, 1)));

  const [employees, shifts, absences, holidays] = await Promise.all([
    db.employee.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.shift.findMany({
      where: { date: { gte: from, lte: to } },
      include: { segments: { include: { activityType: true } } },
    }),
    db.absenceRequest.findMany({ where: { status: "APPROVED", startDate: { lte: to }, endDate: { gte: from } } }),
    db.holiday.findMany({ where: { closed: true, date: { gte: from, lte: to } } }),
  ]);

  // Soll anteilig: Wochenstunden / 5 je Werktag (Mo–Fr ohne Feiertage)
  const holidaySet = new Set(holidays.map((x) => x.date.toISOString().slice(0, 10)));
  let workdays = 0;
  for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86_400_000)) {
    const wd = d.getUTCDay();
    if (wd >= 1 && wd <= 5 && !holidaySet.has(d.toISOString().slice(0, 10))) workdays++;
  }

  const rows = employees.map((e) => {
    const own = shifts.filter((s) => s.employeeId === e.id);
    let work = 0;
    let inbound = 0;
    let outbound = 0;
    for (const s of own)
      for (const seg of s.segments) {
        const len = seg.endMin - seg.startMin;
        if (seg.activityType.isWorkTime) work += len;
        if (seg.activityType.isPhoneTime) inbound += len;
        if (seg.activityType.key === "OUTBOUND") outbound += len;
      }
    let absentDays = 0;
    for (const a of absences.filter((x) => x.employeeId === e.id)) {
      for (let d = new Date(Math.max(a.startDate.getTime(), from.getTime())); d <= a.endDate && d <= to; d = new Date(d.getTime() + 86_400_000)) {
        const wd = d.getUTCDay();
        if (wd >= 1 && wd <= 5 && !holidaySet.has(d.toISOString().slice(0, 10))) absentDays++;
      }
    }
    const target = ((e.weeklyHours * 60) / 5) * (workdays - absentDays);
    return { e, work, inbound, outbound, absentDays, target, shifts: own.length };
  });
  const total = rows.reduce(
    (s, r) => ({ work: s.work + r.work, inbound: s.inbound + r.inbound, outbound: s.outbound + r.outbound, target: s.target + r.target }),
    { work: 0, inbound: 0, outbound: 0, target: 0 },
  );

  return (
    <SectionCard
      title={`Stunden ${from.toLocaleDateString("de-DE", { month: "long", year: "numeric", timeZone: "UTC" })}`}
      description={`Geplante Stunden laut Einsatzplan. Soll anteilig für ${workdays} Werktage, abzüglich genehmigter Abwesenheiten.`}
      actions={
        <div className="flex items-center rounded-lg border">
          <Button variant="ghost" size="icon" asChild aria-label="Vorheriger Monat">
            <Link href={`/admin/auswertung?m=${prev}`}>
              <ChevronLeft />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" asChild aria-label="Nächster Monat">
            <Link href={`/admin/auswertung?m=${next}`}>
              <ChevronRight />
            </Link>
          </Button>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm tabular-nums">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-2 font-normal">Mitarbeiter</th>
              <th className="pb-2 text-right font-normal">Schichten</th>
              <th className="pb-2 text-right font-normal">Inbound</th>
              <th className="pb-2 text-right font-normal">Outbound</th>
              <th className="pb-2 text-right font-normal">Geplant</th>
              <th className="pb-2 text-right font-normal">Soll</th>
              <th className="pb-2 text-right font-normal">Differenz</th>
              <th className="pb-2 text-right font-normal">Abw.-Tage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const diff = r.work - r.target;
              return (
                <tr key={r.e.id} className="border-t">
                  <td className="py-2">
                    <span className="mr-2 inline-block size-2 rounded-full" style={{ backgroundColor: r.e.color }} />
                    {r.e.firstName} {r.e.lastName}
                  </td>
                  <td className="py-2 text-right">{r.shifts}</td>
                  <td className="py-2 text-right">{h(r.inbound)} h</td>
                  <td className="py-2 text-right">{h(r.outbound)} h</td>
                  <td className="py-2 text-right font-medium">{h(r.work)} h</td>
                  <td className="py-2 text-right text-muted-foreground">{h(r.target)} h</td>
                  <td
                    className={cn(
                      "py-2 text-right",
                      Math.abs(diff) < 60 ? "text-muted-foreground" : diff > 0 ? "text-destructive" : "text-warning",
                    )}
                  >
                    {diff > 0 ? "+" : ""}
                    {h(diff)} h
                  </td>
                  <td className="py-2 text-right">{r.absentDays || "–"}</td>
                </tr>
              );
            })}
            <tr className="border-t font-medium">
              <td className="py-2">Gesamt</td>
              <td />
              <td className="py-2 text-right">{h(total.inbound)} h</td>
              <td className="py-2 text-right">{h(total.outbound)} h</td>
              <td className="py-2 text-right">{h(total.work)} h</td>
              <td className="py-2 text-right text-muted-foreground">{h(total.target)} h</td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
