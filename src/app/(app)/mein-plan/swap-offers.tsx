"use client";

import { useTransition } from "react";
import { ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fmtDay, minToHHMM, parseDateOnly } from "@/lib/time";
import { respondToSwap } from "./actions";

export type SwapOffer = {
  id: string;
  from: string;
  date: string | null;
  startMin: number | null;
  endMin: number | null;
  comment: string | null;
};

export function SwapOffers({ offers }: { offers: SwapOffer[] }) {
  const [pending, startTransition] = useTransition();
  const respond = (id: string, accept: boolean) =>
    startTransition(async () => {
      const r = await respondToSwap(id, accept);
      if (!r.ok) toast.error(r.error);
      else toast.success(r.message);
    });

  return (
    <div className="space-y-2">
      {offers.map((o) => (
        <div key={o.id} className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center">
          <ArrowLeftRight className="hidden size-5 shrink-0 text-primary sm:block" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{o.from} möchte dir eine Schicht übergeben</div>
            <div className="text-sm text-muted-foreground">
              {o.date && fmtDay(parseDateOnly(o.date), "EEEE, dd.MM.")} ·{" "}
              {o.startMin != null && `${minToHHMM(o.startMin)}–${minToHHMM(o.endMin ?? 0)}`}
              {o.comment && ` · „${o.comment}“`}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={pending} onClick={() => respond(o.id, false)}>
              Ablehnen
            </Button>
            <Button disabled={pending} onClick={() => respond(o.id, true)}>
              Übernehmen
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
