"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CONTRACT_LABEL, ROLE_LABEL, SKILL_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { resendInvite, setEmployeeActive } from "./actions";
import { EmployeeSheet, type EmployeeRow } from "./employee-sheet";

export function EmployeeList({ employees }: { employees: EmployeeRow[] }) {
  const [editing, setEditing] = useState<EmployeeRow | null>(null);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  const activeHours = employees.filter((e) => e.active).reduce((s, e) => s + e.weeklyHours, 0);

  function openNew() {
    setEditing(null);
    setOpen(true);
  }

  function invite(id: string) {
    startTransition(async () => {
      const r = await resendInvite(id);
      if (!r.ok) { toast.error(r.error); return; }
      await navigator.clipboard?.writeText(r.data!.inviteUrl).catch(() => {});
      toast.success("Einladung versendet", { description: "Der Link wurde zusätzlich in die Zwischenablage kopiert." });
    });
  }

  function toggleActive(e: EmployeeRow) {
    startTransition(async () => {
      const r = await setEmployeeActive(e.id, !e.active);
      if (!r.ok) toast.error(r.error);
      else toast.success(r.message);
    });
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {employees.filter((e) => e.active).length} aktiv ·{" "}
          {activeHours.toLocaleString("de-DE")} Wochenstunden laut Vertrag
        </p>
        <Button onClick={openNew}>
          <Plus /> Mitarbeiter
        </Button>
      </div>

      <div className="divide-y rounded-2xl border bg-card">
        {employees.map((e) => (
          <div
            key={e.id}
            className={cn("flex items-center gap-4 px-4 py-3", !e.active && "opacity-50")}
          >
            <button
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
              onClick={() => {
                setEditing(e);
                setOpen(true);
              }}
            >
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: e.color }}
              >
                {e.firstName[0]}
                {e.lastName[0]}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {e.firstName} {e.lastName}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{e.email}</span>
              </span>
            </button>
            <div className="hidden items-center gap-1.5 sm:flex">
              {e.skills.map((s) => (
                <Badge key={s} variant="secondary">
                  {SKILL_LABEL[s]}
                </Badge>
              ))}
            </div>
            <div className="hidden w-28 text-right text-sm md:block">
              <div>{e.weeklyHours.toLocaleString("de-DE")} h/Woche</div>
              <div className="text-xs text-muted-foreground">{CONTRACT_LABEL[e.contractType]}</div>
            </div>
            <div className="hidden w-28 text-right lg:block">
              {e.invited ? (
                <Badge variant="outline">Eingeladen</Badge>
              ) : !e.active ? (
                <Badge variant="outline">Inaktiv</Badge>
              ) : (
                <span className="text-xs text-muted-foreground">{ROLE_LABEL[e.role]}</span>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Aktionen">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    setEditing(e);
                    setOpen(true);
                  }}
                >
                  Bearbeiten
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => invite(e.id)}>Einladung erneut senden</DropdownMenuItem>
                <DropdownMenuItem onClick={() => toggleActive(e)}>
                  {e.active ? "Deaktivieren" : "Aktivieren"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>

      <EmployeeSheet open={open} onOpenChange={setOpen} employee={editing} />
    </>
  );
}
