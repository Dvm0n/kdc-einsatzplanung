"use client";

import { useRef, useState, useTransition } from "react";
import { FileUp } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ColumnMapping } from "@/lib/import/parse";
import { previewImport, runImport } from "./actions";

type Preview = { headers: string[]; sample: string[][]; rowCount: number; guess: Partial<ColumnMapping> };

const FIELDS: { key: keyof ColumnMapping; label: string; required?: boolean; hint?: string }[] = [
  { key: "date", label: "Datum", required: true, hint: "ggf. inkl. Uhrzeit" },
  { key: "time", label: "Intervallbeginn", hint: "leer, wenn im Datum enthalten" },
  { key: "offered", label: "Angebotene Anrufe", required: true },
  { key: "handled", label: "Angenommene Anrufe" },
  { key: "aht", label: "Ø Bearbeitungszeit (AHT)", hint: "Sekunden oder mm:ss" },
  { key: "talkTotal", label: "Gesamtgesprächszeit", hint: "alternativ zur AHT" },
];

const NONE = "-";

export function ImportCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  function onFile() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    setErrors([]);
    startTransition(async () => {
      const r = await previewImport(fd);
      if (!r.ok) {
        toast.error(r.error);
        setPreview(null);
        return;
      }
      setPreview(r.data!);
      const m: Record<string, string> = {};
      for (const f of FIELDS) {
        const g = r.data!.guess[f.key];
        m[f.key] = g == null ? NONE : String(g);
      }
      setMapping(m);
    });
  }

  function doImport() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const toNum = (v: string | undefined) => (v == null || v === NONE ? null : Number(v));
    const map = {
      date: toNum(mapping.date),
      time: toNum(mapping.time),
      offered: toNum(mapping.offered),
      handled: toNum(mapping.handled),
      aht: toNum(mapping.aht),
      talkTotal: toNum(mapping.talkTotal),
    };
    if (map.date == null || map.offered == null) {
      toast.error("Bitte Datum und angebotene Anrufe zuordnen");
      return;
    }
    const fd = new FormData();
    fd.set("file", file);
    fd.set("mapping", JSON.stringify(map));
    startTransition(async () => {
      const r = await runImport(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      setErrors(r.data?.errors ?? []);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  return (
    <SectionCard
      title="Anrufhistorie importieren"
      description="CSV- oder Excel-Export der Telefonanlage, eine Zeile pro Intervall. Vorhandene Daten derselben Tage werden ersetzt."
    >
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center transition hover:bg-muted/50">
        <FileUp className="size-6 text-muted-foreground" />
        <span className="text-sm font-medium">{pending && !preview ? "Wird gelesen …" : "Datei auswählen"}</span>
        <span className="text-xs text-muted-foreground">.csv oder .xlsx, max. 10 MB</span>
        <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx" className="sr-only" onChange={onFile} />
      </label>

      {preview && (
        <div className="mt-6 space-y-5">
          <div>
            <p className="mb-2 text-sm">
              <span className="font-medium">{preview.rowCount}</span> Zeilen erkannt. Vorschau:
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    {preview.headers.map((h, i) => (
                      <th key={i} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                        {h || `Spalte ${i + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((r, i) => (
                    <tr key={i} className="border-t">
                      {r.map((c, j) => (
                        <td key={j} className="px-2 py-1 whitespace-nowrap text-muted-foreground">
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <span className="text-sm font-medium">
                  {f.label}
                  {f.required && <span className="text-destructive"> *</span>}
                </span>
                <Select value={mapping[f.key] ?? NONE} onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v }))}>
                  <SelectTrigger className="w-full" aria-label={f.label}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {!f.required && <SelectItem value={NONE}>– nicht vorhanden –</SelectItem>}
                    {preview.headers.map((h, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {h || `Spalte ${i + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {f.hint && <span className="block text-xs text-muted-foreground">{f.hint}</span>}
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPreview(null)}>
              Abbrechen
            </Button>
            <Button onClick={doImport} disabled={pending}>
              {pending ? "Importiere …" : "Importieren"}
            </Button>
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="mt-4 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
          <p className="mb-1 font-medium">Einige Zeilen wurden übersprungen:</p>
          <ul className="list-inside list-disc text-muted-foreground">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}
