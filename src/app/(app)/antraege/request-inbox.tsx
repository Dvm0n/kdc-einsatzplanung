"use client";

import { useState, useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ABSENCE_LABEL, CHANGE_TYPE_LABEL } from "@/lib/labels";
import { fmtDay, minToHHMM, parseDateOnly } from "@/lib/time";
import { cn } from "@/lib/utils";
import { decideAbsence, decideChange } from "./actions";

export type InboxItem = {
  kind: "change" | "absence";
  id: string;
  type: string;
  status: string;
  createdAt: string;
  employee: string;
  color: string;
  date: string | null;
  endDate: string | null;
  shiftStart: number | null;
  shiftEnd: number | null;
  proposedStart: number | null;
  proposedEnd: number | null;
  proposedDetail: string | null;
  partner: string | null;
  comment: string | null;
  adminComment: string | null;
  actionable: boolean;
  overlaps: string[];
};

export function RequestInbox({ items }: { items: InboxItem[] }) {
  const [tab, setTab] = useState<"open" | "done">("open");
  const open = items.filter((i) => i.status === "PENDING" || i.status === "PEER_ACCEPTED");
  const done = items.filter((i) => !open.includes(i));
  const list = tab === "open" ? open : done;

  return (
    <div className="space-y-4">
      <div className="flex rounded-lg border bg-card p-0.5 text-sm sm:w-fit">
        {(
          [
            ["open", `Offen (${open.length})`],
            ["done", "Erledigt (30 Tage)"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              "flex-1 rounded-md px-3 py-1 whitespace-nowrap text-muted-foreground",
              tab === k && "bg-muted font-medium text-foreground",
            )}
          >
            {l}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState title={tab === "open" ? "Alles erledigt" : "Keine Einträge"}>
          {tab === "open" ? "Es gibt keine offenen Anträge." : undefined}
        </EmptyState>
      ) : (
        list.map((i) => <InboxCard key={`${i.kind}-${i.id}`} item={i} />)
      )}
    </div>
  );
}

function InboxCard({ item: i }: { item: InboxItem }) {
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();

  function decide(approve: boolean) {
    startTransition(async () => {
      const r = i.kind === "change" ? await decideChange(i.id, approve, comment) : await decideAbsence(i.id, approve, comment);
      if (!r.ok) toast.error(r.error);
      else toast.success(r.message);
    });
  }

  const label = i.kind === "change" ? CHANGE_TYPE_LABEL[i.type] : ABSENCE_LABEL[i.type];
  const isOpen = i.status === "PENDING" || i.status === "PEER_ACCEPTED";

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
          style={{ backgroundColor: i.color }}
        >
          {i.employee
            .split(" ")
            .map((p) => p[0])
            .join("")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{i.employee}</span>
            <Badge variant="outline">{label}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            {i.kind === "absence" && i.date && (
              <span>
                {fmtDay(parseDateOnly(i.date), "EEE dd.MM.")} – {fmtDay(parseDateOnly(i.endDate!), "EEE dd.MM.yyyy")}
              </span>
            )}
            {i.kind === "change" && i.date && (
              <>
                <span>
                  {fmtDay(parseDateOnly(i.date), "EEE dd.MM.")} · {minToHHMM(i.shiftStart ?? 0)}–{minToHHMM(i.shiftEnd ?? 0)}
                </span>
                {i.type === "CHANGE_TIME" && (
                  <>
                    <ArrowRight className="size-3.5" />
                    <span className="font-medium text-foreground">
                      {minToHHMM(i.proposedStart ?? 0)}–{minToHHMM(i.proposedEnd ?? 0)}
                    </span>
                  </>
                )}
                {i.type === "DAY_OFF" && (
                  <>
                    <ArrowRight className="size-3.5" />
                    <span className="font-medium text-foreground">frei</span>
                  </>
                )}
                {i.type === "SWAP" && (
                  <>
                    <ArrowRight className="size-3.5" />
                    <span className="font-medium text-foreground">{i.partner}</span>
                    {i.status === "PENDING" && <span className="text-xs">(Zusage ausstehend)</span>}
                  </>
                )}
              </>
            )}
          </div>
          {i.proposedDetail && (
            <p className="mt-1 text-xs text-muted-foreground">Neuer Ablauf: {i.proposedDetail}</p>
          )}
          {i.comment && <p className="mt-1.5 text-sm">„{i.comment}“</p>}
          {i.overlaps.length > 0 && (
            <p className="mt-1.5 text-xs text-warning">Im selben Zeitraum abwesend: {i.overlaps.join(", ")}</p>
          )}
          {!isOpen && i.adminComment && <p className="mt-1.5 text-xs text-muted-foreground">Kommentar: „{i.adminComment}“</p>}
        </div>
        <StatusBadge status={i.status} />
      </div>
      {isOpen && (
        <div className="mt-3 flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center">
          <Input
            placeholder="Kommentar an die Person (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="flex-1"
          />
          <div className="flex gap-2">
            <Button variant="outline" disabled={pending} onClick={() => decide(false)}>
              Ablehnen
            </Button>
            <Button disabled={pending || !i.actionable} onClick={() => decide(true)}>
              Genehmigen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
