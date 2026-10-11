"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, fail, zodMessage } from "@/lib/action-result";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { applyMapping, guessMapping, readTable, type Cell, type ColumnMapping } from "@/lib/import/parse";
import { requirePlanner } from "@/lib/session";
import { parseDateOnly } from "@/lib/time";

const MAX_BYTES = 10 * 1024 * 1024;

async function fileFrom(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_BYTES) throw new Error("Die Datei ist größer als 10 MB.");
  if (!/\.(csv|txt|xlsx)$/i.test(file.name)) throw new Error("Bitte eine CSV- oder XLSX-Datei hochladen.");
  return file;
}

const show = (c: Cell) => (c instanceof Date ? c.toISOString().replace("T", " ").slice(0, 16) : c == null ? "" : String(c));

export async function previewImport(
  formData: FormData,
): Promise<ActionResult<{ headers: string[]; sample: string[][]; rowCount: number; guess: Partial<ColumnMapping> }>> {
  await requirePlanner();
  try {
    const file = await fileFrom(formData);
    if (!file) return fail("Keine Datei ausgewählt");
    const table = await readTable(file.name, await file.arrayBuffer());
    if (table.headers.length === 0) return fail("Die Datei enthält keine Daten");
    return {
      ok: true,
      data: {
        headers: table.headers,
        sample: table.rows.slice(0, 5).map((r) => table.headers.map((_, i) => show(r[i] ?? null))),
        rowCount: table.rows.length,
        guess: guessMapping(table.headers),
      },
    };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Datei konnte nicht gelesen werden");
  }
}

const mappingSchema = z.object({
  date: z.number().int().min(0),
  time: z.number().int().min(0).nullable(),
  offered: z.number().int().min(0),
  handled: z.number().int().min(0).nullable(),
  aht: z.number().int().min(0).nullable(),
  talkTotal: z.number().int().min(0).nullable(),
});

export async function runImport(formData: FormData): Promise<ActionResult<{ imported: number; errors: string[] }>> {
  const user = await requirePlanner();
  let mapping: ColumnMapping;
  try {
    const p = mappingSchema.safeParse(JSON.parse(String(formData.get("mapping") ?? "{}")));
    if (!p.success) return fail(zodMessage(p.error));
    mapping = p.data;
  } catch {
    return fail("Ungültige Spaltenzuordnung");
  }
  if (mapping.aht == null && mapping.talkTotal == null) return fail("Bitte eine Spalte für die Gesprächsdauer zuordnen");

  try {
    const file = await fileFrom(formData);
    if (!file) return fail("Keine Datei ausgewählt");
    const table = await readTable(file.name, await file.arrayBuffer());
    const { rows, errors } = applyMapping(table, mapping);
    if (rows.length === 0) return fail(errors[0] ?? "Keine gültigen Zeilen gefunden");

    // gleiche Intervalle zusammenfassen (z. B. mehrere Queues)
    const merged = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      const k = `${r.date}|${r.startMin}`;
      const prev = merged.get(k);
      if (!prev) merged.set(k, { ...r });
      else {
        const total = prev.offered + r.offered;
        prev.ahtSeconds = total > 0 ? (prev.ahtSeconds * prev.offered + r.ahtSeconds * r.offered) / total : prev.ahtSeconds;
        prev.offered = total;
        prev.handled = prev.handled != null || r.handled != null ? (prev.handled ?? 0) + (r.handled ?? 0) : null;
      }
    }
    const list = [...merged.values()];
    const dates = [...new Set(list.map((r) => r.date))].sort();

    await db.$transaction(async (tx) => {
      const batch = await tx.importBatch.create({
        data: {
          fileName: file.name,
          rowCount: list.length,
          fromDate: parseDateOnly(dates[0]),
          toDate: parseDateOnly(dates[dates.length - 1]),
        },
      });
      // vorhandene Daten dieser Tage werden ersetzt
      await tx.callHistory.deleteMany({ where: { date: { in: dates.map(parseDateOnly) } } });
      await tx.callHistory.createMany({
        data: list.map((r) => ({
          batchId: batch.id,
          date: parseDateOnly(r.date),
          startMin: r.startMin,
          offered: Math.round(r.offered),
          handled: r.handled != null ? Math.round(r.handled) : null,
          ahtSeconds: r.ahtSeconds,
        })),
      });
    });
    await audit(user.id, "import", "CallHistory", null, { file: file.name, rows: list.length, errors: errors.length });
    revalidatePath("/bedarf");
    revalidatePath("/plan");
    return {
      ok: true,
      message: `${list.length} Intervalle importiert (${dates.length} Tage)`,
      data: { imported: list.length, errors: errors.slice(0, 20) },
    };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Import fehlgeschlagen");
  }
}

export async function deleteBatch(id: string): Promise<ActionResult> {
  const user = await requirePlanner();
  await db.importBatch.delete({ where: { id } });
  await audit(user.id, "delete", "ImportBatch", id);
  revalidatePath("/bedarf");
  revalidatePath("/plan");
  return { ok: true, message: "Import entfernt" };
}

export async function setAdjustment(dateIso: string, percent: number, note?: string): Promise<ActionResult> {
  const user = await requirePlanner();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso) || !Number.isFinite(percent) || percent < -90 || percent > 300) {
    return fail("Ungültiger Wert");
  }
  const date = parseDateOnly(dateIso);
  if (percent === 0) await db.forecastAdjustment.deleteMany({ where: { date } });
  else {
    const factor = 1 + percent / 100;
    await db.forecastAdjustment.upsert({ where: { date }, update: { factor, note }, create: { date, factor, note } });
  }
  await audit(user.id, "adjust", "Forecast", dateIso, { percent });
  revalidatePath("/bedarf");
  revalidatePath("/plan");
  return { ok: true, message: "Korrektur gespeichert" };
}
