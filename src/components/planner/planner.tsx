"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eraser,
  Info,
  Eye,
  EyeOff,
  Printer,
  Send,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { clearWeek, copyPreviousWeek, publishWeek, unpublishWeek } from "@/app/(app)/plan/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ShiftDTO } from "@/lib/planning/types";
import type { WeekData } from "@/lib/schedule";
import { addDaysUTC, fmtDay, fmtWeekRange, formatDateOnly, isoWeekday, isoWeekNumber, parseDateOnly } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { DayDemand } from "@/lib/demand";
import { DayTimeline } from "./day-timeline";
import { ProposalButton } from "./proposal-button";
import { ActivityLegend } from "./shift-bar";
import { draftFromShift, ShiftSheet, type ShiftDraft } from "./shift-sheet";
import { CreateOpenShiftDialog, OpenShiftDialog } from "./open-shift-dialogs";
import type { OpenShiftDTO } from "@/lib/open-shifts";
import { WeekGrid } from "./week-grid";

export function Planner({
  data,
  canEdit,
  view,
  day,
  highlightEmployeeId,
  extra,
  demand,
}: {
  demand?: DayDemand[];
  data: WeekData;
  canEdit: boolean;
  view: "week" | "day";
  day: string;
  highlightEmployeeId?: string | null;
  extra?: React.ReactNode;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<ShiftDraft | null>(null);
  const [showWarnings, setShowWarnings] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [openShiftView, setOpenShiftView] = useState<OpenShiftDTO | null>(null);
  const [createOpenDate, setCreateOpenDate] = useState<string | null>(null);

  /** Wer kann eine offene Schicht nicht übernehmen? (Überschneidung oder Abwesenheit) */
  function openShiftConflicts(o: OpenShiftDTO): Record<string, string> {
    const out: Record<string, string> = {};
    for (const e of data.employees) {
      const clash = data.shifts.some(
        (s) => s.employeeId === e.id && s.date === o.date && s.id !== o.sourceShiftId && s.startMin < o.endMin && s.endMin > o.startMin,
      );
      const absent = data.absences.some((a) => a.employeeId === e.id && a.startDate <= o.date && a.endDate >= o.date);
      if (clash) out[e.id] = "arbeitet zu dieser Zeit bereits";
      else if (absent) out[e.id] = "ist abwesend";
    }
    return out;
  }
  useEffect(() => {
    try {
      setShowClosed(localStorage.getItem("kdc.showClosedDays") === "1");
    } catch {}
  }, []);
  function toggleClosed() {
    setShowClosed((v) => {
      try {
        localStorage.setItem("kdc.showClosedDays", v ? "0" : "1");
      } catch {}
      return !v;
    });
  }
  const [pending, startTransition] = useTransition();

  const weekStart = parseDateOnly(data.weekStart);
  const href = (params: Record<string, string>) => {
    const sp = new URLSearchParams({ w: data.weekStart, view, d: day, ...params });
    return `/plan?${sp.toString()}`;
  };

  function openEdit(s: ShiftDTO) {
    setDraft(draftFromShift(s, data.activities));
    setSheetOpen(true);
  }
  function openCreate(employeeId: string, date: string) {
    const inbound = data.activities.find((a) => a.isPhoneTime) ?? data.activities[0];
    const tpl = data.templates[0];
    setDraft({
      employeeId,
      date,
      startMin: tpl?.startMin ?? 8 * 60,
      endMin: tpl?.endMin ?? 12 * 60,
      activityTypeId: tpl?.activityTypeId ?? inbound.id,
      autoBreak: true,
      segments: [
        {
          activityTypeId: tpl?.activityTypeId ?? inbound.id,
          startMin: tpl?.startMin ?? 8 * 60,
          endMin: tpl?.endMin ?? 12 * 60,
        },
      ],
      note: "",
    });
    setSheetOpen(true);
  }

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else if (r.message) toast.success(r.message);
    });

  const demandByDate = demand ? Object.fromEntries(demand.map((d) => [d.date, d])) : undefined;

  // Tage ohne Call-Zeiten (z. B. Sa/So) standardmäßig ausblenden – außer es liegen dort Schichten
  // (Feiertage unter der Woche bleiben sichtbar – dort steht der Feiertagshinweis)
  const closedDays = data.days.filter((d) => !data.serviceHours.some((w) => w.weekday === isoWeekday(parseDateOnly(d))));
  const visibleDays = data.days.filter(
    (d) => showClosed || !closedDays.includes(d) || data.shifts.some((s) => s.date === d) || d === day,
  );
  const errors = data.warnings.filter((w) => w.level === "error").length;
  const warns = data.warnings.filter((w) => w.level === "warning").length;
  const empName = Object.fromEntries(data.employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));

  return (
    <div className="space-y-4">
      {/* Kopf */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="print-hidden flex items-center rounded-lg border bg-card">
            <Button variant="ghost" size="icon" asChild aria-label="Vorherige Woche">
              <Link href={href({ w: formatDateOnly(addDaysUTC(weekStart, -7)), d: formatDateOnly(addDaysUTC(parseDateOnly(day), -7)) })}>
                <ChevronLeft />
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/plan">Heute</Link>
            </Button>
            <Button variant="ghost" size="icon" asChild aria-label="Nächste Woche">
              <Link href={href({ w: formatDateOnly(addDaysUTC(weekStart, 7)), d: formatDateOnly(addDaysUTC(parseDateOnly(day), 7)) })}>
                <ChevronRight />
              </Link>
            </Button>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">KW {isoWeekNumber(weekStart)}</h1>
              {data.status === "PUBLISHED" ? (
                <Badge className="bg-success/15 text-success">Veröffentlicht</Badge>
              ) : (
                <Badge variant="secondary">Entwurf</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{fmtWeekRange(weekStart)}</p>
          </div>
        </div>

        <div className="print-hidden flex flex-wrap items-center gap-2">
          {closedDays.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleClosed()}
              title={showClosed ? "Geschlossene Tage ausblenden" : "Geschlossene Tage einblenden"}
            >
              {showClosed ? <EyeOff /> : <Eye />}
              {closedDays.map((d) => fmtDay(parseDateOnly(d), "EEEEEE")).join("/")}
            </Button>
          )}
          <Button variant="ghost" size="icon" aria-label="Drucken" onClick={() => window.print()}>
            <Printer />
          </Button>
          <div className="flex rounded-lg border bg-card p-0.5">
            {(["week", "day"] as const).map((v) => (
              <Link
                key={v}
                href={href({ view: v })}
                className={cn(
                  "rounded-md px-3 py-1 text-sm text-muted-foreground transition",
                  view === v && "bg-muted font-medium text-foreground",
                )}
              >
                {v === "week" ? "Woche" : "Tag"}
              </Link>
            ))}
          </div>

          {canEdit && (
            <>
              {data.warnings.length > 0 && (
                <Button variant="outline" onClick={() => setShowWarnings((s) => !s)}>
                  {errors + warns > 0 ? (
                    <AlertTriangle className={errors ? "text-destructive" : "text-warning"} />
                  ) : (
                    <Info className="text-muted-foreground" />
                  )}
                  {data.warnings.length} {data.warnings.length === 1 ? "Hinweis" : "Hinweise"}
                  <ChevronDown className={cn("transition", showWarnings && "rotate-180")} />
                </Button>
              )}
              {extra}
              {data.status !== "PUBLISHED" && (
                <ProposalButton weekStart={data.weekStart} hasShifts={data.shifts.length > 0} disabled={pending} />
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" disabled={pending}>
                    Woche <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => run(() => copyPreviousWeek(data.weekStart))}>
                    <Copy /> Vorwoche übernehmen
                  </DropdownMenuItem>
                  {data.status === "PUBLISHED" ? (
                    <DropdownMenuItem onClick={() => run(() => unpublishWeek(data.weekStart))}>
                      <Undo2 /> Zurück in den Entwurf
                    </DropdownMenuItem>
                  ) : (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => {
                          if (confirm("Alle Schichten dieser Woche entfernen?")) run(() => clearWeek(data.weekStart));
                        }}
                      >
                        <Eraser /> Woche leeren
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              {data.status !== "PUBLISHED" && (
                <Button
                  disabled={pending || data.shifts.length === 0}
                  onClick={() => {
                    if (errors > 0 && !confirm(`Es gibt ${errors} Regelverstöße. Trotzdem veröffentlichen?`)) return;
                    run(() => publishWeek(data.weekStart));
                  }}
                >
                  <Send /> Veröffentlichen
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {canEdit && showWarnings && data.warnings.length > 0 && (
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-2xl border bg-card p-3">
          {data.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/50">
              {w.level === "info" ? (
                <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              ) : (
                <AlertTriangle
                  className={cn("mt-0.5 size-4 shrink-0", w.level === "error" ? "text-destructive" : "text-warning")}
                />
              )}
              <span className="w-36 shrink-0 font-medium">{empName[w.employeeId]}</span>
              <span className="text-muted-foreground">{w.message}</span>
            </div>
          ))}
        </div>
      )}

      {view === "day" && (
        <div className="flex gap-1 overflow-x-auto">
          {visibleDays.map((dd) => (
            <Link
              key={dd}
              href={href({ d: dd })}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm whitespace-nowrap text-muted-foreground transition hover:bg-muted",
                dd === day && "border-primary bg-primary/10 font-medium text-primary",
              )}
            >
              {fmtDay(parseDateOnly(dd), "EEE dd.MM.")}
            </Link>
          ))}
        </div>
      )}

      {view === "week" ? (
        <WeekGrid
          data={data}
          canEdit={canEdit}
          highlightEmployeeId={highlightEmployeeId}
          onEdit={openEdit}
          onCreate={openCreate}
          onOpenDay={(d) => router.push(href({ view: "day", d }))}
          demandByDate={demandByDate}
          visibleDays={visibleDays}
          onOpenShift={setOpenShiftView}
          onCreateOpenShift={setCreateOpenDate}
        />
      ) : (
        <DayTimeline
          data={data}
          date={day}
          canEdit={canEdit}
          highlightEmployeeId={highlightEmployeeId}
          onEdit={openEdit}
          onCreate={openCreate}
          demand={demandByDate?.[day]}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <ActivityLegend activities={data.activities} />
        {canEdit && view === "week" && (
          <p className="text-xs text-muted-foreground">
            Tipp: Schichten per Drag &amp; Drop verschieben, mit gedrückter Strg-Taste kopieren.
          </p>
        )}
      </div>

      {canEdit && <ShiftSheet open={sheetOpen} onOpenChange={setSheetOpen} initial={draft} data={data} />}
      <OpenShiftDialog
        shift={openShiftView}
        onClose={() => setOpenShiftView(null)}
        activities={data.activities}
        employees={data.employees}
        planner={canEdit}
        myEmployeeId={highlightEmployeeId}
        conflicts={openShiftView ? openShiftConflicts(openShiftView) : undefined}
      />
      {canEdit && (
        <CreateOpenShiftDialog
          date={createOpenDate}
          days={visibleDays}
          onClose={() => setCreateOpenDate(null)}
          activities={data.activities}
          templates={data.templates}
        />
      )}
    </div>
  );
}
