"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { CHANGE_TYPE_LABEL } from "@/lib/labels";
import { fmtDay, minToHHMM, parseDateOnly } from "@/lib/time";
import { cancelChange } from "./actions";

export type MyRequest = {
  id: string;
  type: string;
  status: string;
  date: string | null;
  shiftStart: number | null;
  shiftEnd: number | null;
  proposedStart: number | null;
  proposedEnd: number | null;
  partner: string | null;
  adminComment: string | null;
};

export function MyRequests({ requests }: { requests: MyRequest[] }) {
  const [pending, startTransition] = useTransition();
  if (requests.length === 0) return null;

  return (
    <SectionCard title="Meine Anträge">
      <div className="divide-y">
        {requests.map((r) => (
          <div key={r.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">
                {CHANGE_TYPE_LABEL[r.type]}
                {r.date && <span className="font-normal text-muted-foreground"> · {fmtDay(parseDateOnly(r.date), "EEE dd.MM.")}</span>}
              </div>
              <div className="text-xs text-muted-foreground">
                {r.shiftStart != null && `${minToHHMM(r.shiftStart)}–${minToHHMM(r.shiftEnd ?? 0)}`}
                {r.type === "CHANGE_TIME" && r.proposedStart != null && ` → ${minToHHMM(r.proposedStart)}–${minToHHMM(r.proposedEnd ?? 0)}`}
                {r.partner && ` → ${r.partner}`}
              </div>
              {r.adminComment && <div className="mt-0.5 text-xs">Planung: „{r.adminComment}“</div>}
            </div>
            <StatusBadge status={r.status} />
            {(r.status === "PENDING" || r.status === "PEER_ACCEPTED") && (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await cancelChange(r.id);
                    if (!res.ok) toast.error(res.error);
                    else toast.success(res.message);
                  })
                }
              >
                Zurückziehen
              </Button>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
