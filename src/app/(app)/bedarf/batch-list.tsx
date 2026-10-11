"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { fmtDay, parseDateOnly } from "@/lib/time";
import { deleteBatch } from "./actions";

type Batch = { id: string; fileName: string; rowCount: number; from: string; to: string; createdAt: string };

export function BatchList({ batches }: { batches: Batch[] }) {
  const [pending, startTransition] = useTransition();
  if (batches.length === 0) return null;
  return (
    <SectionCard title="Bisherige Importe">
      <div className="divide-y">
        {batches.map((b) => (
          <div key={b.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate font-medium">{b.fileName}</span>
            <span className="hidden text-muted-foreground sm:block">
              {fmtDay(parseDateOnly(b.from), "dd.MM.yy")} – {fmtDay(parseDateOnly(b.to), "dd.MM.yy")}
            </span>
            <span className="w-28 text-right text-muted-foreground tabular-nums">{b.rowCount} Intervalle</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Import entfernen"
              disabled={pending}
              onClick={() => {
                if (!confirm(`Import „${b.fileName}“ mit allen Daten entfernen?`)) return;
                startTransition(async () => {
                  const r = await deleteBatch(b.id);
                  if (r.ok) toast.success(r.message);
                });
              }}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
