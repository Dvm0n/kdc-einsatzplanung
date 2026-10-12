import Link from "next/link";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { fairnessReport, monthReport } from "@/lib/report";
import { addDaysUTC, toDateOnly, weekStartOf } from "@/lib/time";
import { cn } from "@/lib/utils";

const h = (m: number) => (m / 60).toLocaleString("de-DE", { maximumFractionDigits: 1 });
const FAIR_WEEKS = 8;

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const now = new Date();
  const [y, mo] = sp.m && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const current = monthKey(new Date(Date.UTC(y, mo - 1, 1)));
  const prev = monthKey(new Date(Date.UTC(y, mo - 2, 1)));
  const next = monthKey(new Date(Date.UTC(y, mo, 1)));

  // Fairness: abgeschlossene Wochen bis einschließlich der aktuellen
  const fairUntil = addDaysUTC(weekStartOf(toDateOnly(now)), 7);
  const [report, fairness] = await Promise.all([monthReport(y, mo), fairnessReport(fairUntil, FAIR_WEEKS)]);
  const { from, workdays, rows, total } = report;
  const maxEdge = Math.max(1, ...fairness.map((f) => f.early + f.late));

  return (
    <div className="space-y-6">
      <SectionCard
        title={`Stunden ${from.toLocaleDateString("de-DE", { month: "long", year: "numeric", timeZone: "UTC" })}`}
        description={`Geplante Stunden laut Einsatzplan. Soll anteilig für ${workdays} Werktage, abzüglich genehmigter Abwesenheiten.`}
        actions={
          <>
            <Button variant="outline" asChild>
              <a href={`/api/export/stunden?m=${current}&format=xlsx`}>
                <Download /> Excel
              </a>
            </Button>
            <Button variant="ghost" asChild>
              <a href={`/api/export/stunden?m=${current}&format=csv`}>CSV</a>
            </Button>
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
          </>
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
                  <tr key={r.employee.id} className="border-t">
                    <td className="py-2">
                      <span className="mr-2 inline-block size-2 rounded-full" style={{ backgroundColor: r.employee.color }} />
                      {r.employee.firstName} {r.employee.lastName}
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

      <SectionCard
        title="Faire Verteilung der Randzeiten"
        description={`Früh = erste Stunde der Call-Zeiten, Spät = letzte Stunde – über die letzten ${FAIR_WEEKS} Wochen. Der Planvorschlag gleicht das automatisch aus.`}
      >
        <div className="space-y-2.5">
          {fairness.map((f) => (
            <div key={f.employee.id} className="grid grid-cols-[9rem_1fr_7rem] items-center gap-3 text-sm sm:grid-cols-[11rem_1fr_9rem]">
              <span className="truncate">
                <span className="mr-2 inline-block size-2 rounded-full" style={{ backgroundColor: f.employee.color }} />
                {f.employee.firstName} {f.employee.lastName}
              </span>
              <div className="flex h-3 overflow-hidden rounded-full bg-muted" title={`${f.early} früh · ${f.late} spät`}>
                <div className="bg-primary/80" style={{ width: `${(f.early / maxEdge) * 100}%` }} />
                <div className="bg-primary/40" style={{ width: `${(f.late / maxEdge) * 100}%` }} />
              </div>
              <span className="text-right text-xs text-muted-foreground tabular-nums">
                {f.early} früh · {f.late} spät
                {f.shifts > 0 && Math.abs(f.load) >= 0.15 && (
                  <span className={cn("ml-1.5 font-medium", f.load > 0 ? "text-warning" : "text-success")}>
                    {f.load > 0 ? "▲" : "▼"}
                  </span>
                )}
              </span>
            </div>
          ))}
          <div className="flex gap-4 pt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-primary/80" /> Frühschichten
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-primary/40" /> Spätschichten
            </span>
            <span>▲ überdurchschnittlich · ▼ unterdurchschnittlich (pro Schicht)</span>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
