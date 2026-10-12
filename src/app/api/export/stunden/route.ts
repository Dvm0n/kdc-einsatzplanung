import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { monthReport } from "@/lib/report";
import { isPlanner } from "@/lib/session";
import { minToHHMM } from "@/lib/time";

export const dynamic = "force-dynamic";

const hours = (m: number) => Math.round((m / 60) * 100) / 100;
const fmtDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** Monatsstunden für die Lohnabrechnung: /api/export/stunden?m=2026-10&format=xlsx|csv */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user || !isPlanner(session.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const m = url.searchParams.get("m") ?? "";
  if (!/^\d{4}-\d{2}$/.test(m)) return NextResponse.json({ error: "Parameter m=JJJJ-MM fehlt" }, { status: 400 });
  const [y, mo] = m.split("-").map(Number);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const r = await monthReport(y, mo);
  const fileBase = `stunden-${m}`;

  if (format === "csv") {
    const esc = (v: string | number) => {
      const s = typeof v === "number" ? v.toLocaleString("de-DE") : v;
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      ["Mitarbeiter", "Schichten", "Arbeitszeit (h)", "Inbound (h)", "Outbound (h)", "Pausen (h)", "Soll (h)", "Differenz (h)", "Abwesenheitstage"],
      ...r.rows.map((x) => [
        `${x.employee.firstName} ${x.employee.lastName}`,
        x.shifts,
        hours(x.work),
        hours(x.inbound),
        hours(x.outbound),
        hours(x.breaks),
        hours(x.target),
        hours(x.work - x.target),
        x.absentDays,
      ]),
    ];
    // BOM + Semikolon: öffnet sich in deutschem Excel korrekt
    const body = "﻿" + lines.map((l) => l.map(esc).join(";")).join("\r\n");
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileBase}.csv"`,
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "KDC Einsatzplanung";

  const sum = wb.addWorksheet("Übersicht");
  sum.columns = [
    { header: "Mitarbeiter", key: "name", width: 24 },
    { header: "Schichten", key: "shifts", width: 11 },
    { header: "Arbeitszeit (h)", key: "work", width: 15 },
    { header: "Inbound (h)", key: "inbound", width: 13 },
    { header: "Outbound (h)", key: "outbound", width: 13 },
    { header: "Pausen (h)", key: "breaks", width: 12 },
    { header: "Soll (h)", key: "target", width: 11 },
    { header: "Differenz (h)", key: "diff", width: 14 },
    { header: "Abwesenheitstage", key: "absent", width: 17 },
  ];
  for (const x of r.rows) {
    sum.addRow({
      name: `${x.employee.firstName} ${x.employee.lastName}`,
      shifts: x.shifts,
      work: hours(x.work),
      inbound: hours(x.inbound),
      outbound: hours(x.outbound),
      breaks: hours(x.breaks),
      target: hours(x.target),
      diff: hours(x.work - x.target),
      absent: x.absentDays,
    });
  }
  sum.addRow({
    name: "Gesamt",
    work: hours(r.total.work),
    inbound: hours(r.total.inbound),
    outbound: hours(r.total.outbound),
    target: hours(r.total.target),
  }).font = { bold: true };

  const det = wb.addWorksheet("Schichten");
  det.columns = [
    { header: "Datum", key: "date", width: 12 },
    { header: "Mitarbeiter", key: "name", width: 24 },
    { header: "Beginn", key: "start", width: 9 },
    { header: "Ende", key: "end", width: 9 },
    { header: "Pause (min)", key: "brk", width: 12 },
    { header: "Arbeitszeit (h)", key: "work", width: 15 },
    { header: "Ablauf", key: "plan", width: 70 },
  ];
  for (const d of r.details) {
    det.addRow({
      date: fmtDate(d.date),
      name: d.employee,
      start: minToHHMM(d.startMin),
      end: minToHHMM(d.endMin),
      brk: d.breakMin,
      work: hours(d.workMin),
      plan: d.activities.map((a) => `${a.name} ${minToHHMM(a.startMin)}–${minToHHMM(a.endMin)}`).join(" · "),
    });
  }

  for (const ws of [sum, det]) {
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`,
    },
  });
}
