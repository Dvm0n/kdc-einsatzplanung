"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { generateProposal } from "@/app/(app)/plan/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

export function ProposalButton({ weekStart, disabled, hasShifts }: { weekStart: string; disabled?: boolean; hasShifts: boolean }) {
  const [open, setOpen] = useState(false);
  const [fillOutbound, setFillOutbound] = useState(true);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const r = await generateProposal(weekStart, { fillOutbound });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <Sparkles /> Vorschlag
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Planvorschlag erzeugen</DialogTitle>
          <DialogDescription>
            Die Planung verteilt Schichten so, dass der prognostizierte Anrufbedarf gedeckt wird – unter Beachtung von
            Verfügbarkeiten, Urlaub, Vertragsstunden, Pausen und Ruhezeiten.
            {hasShifts && " Vorhandene Schichten bleiben erhalten und werden nur ergänzt."}
          </DialogDescription>
        </DialogHeader>
        <label className="flex items-start justify-between gap-4 rounded-xl border p-3">
          <span>
            <span className="block text-sm font-medium">Restliche Stunden mit Outbound füllen</span>
            <span className="block text-xs text-muted-foreground">
              Nicht für Inbound benötigte Vertragsstunden werden als Outbound eingeplant (nur mit Outbound-Skill).
            </span>
          </span>
          <Switch checked={fillOutbound} onCheckedChange={setFillOutbound} />
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Abbrechen
          </Button>
          <Button onClick={run} disabled={pending}>
            <Sparkles /> {pending ? "Berechne …" : "Vorschlag erzeugen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
