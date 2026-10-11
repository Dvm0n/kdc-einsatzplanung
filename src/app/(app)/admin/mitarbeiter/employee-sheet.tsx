"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CONTRACT_LABEL, EMPLOYEE_COLORS, ROLE_LABEL, SKILL_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { saveEmployee, type EmployeeInput } from "./actions";

export type EmployeeRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "ADMIN" | "TEAMLEAD" | "OPERATOR";
  contractType: "FULLTIME" | "PARTTIME" | "MINIJOB";
  weeklyHours: number;
  maxHoursPerDay: number;
  skills: ("INBOUND" | "OUTBOUND")[];
  color: string;
  active: boolean;
  invited: boolean;
};

const EMPTY: EmployeeInput = {
  firstName: "",
  lastName: "",
  email: "",
  role: "OPERATOR",
  contractType: "PARTTIME",
  weeklyHours: 20,
  maxHoursPerDay: 8,
  skills: ["INBOUND", "OUTBOUND"],
  color: EMPLOYEE_COLORS[0],
};

export function EmployeeSheet({
  open,
  onOpenChange,
  employee,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employee: EmployeeRow | null;
}) {
  const [form, setForm] = useState<EmployeeInput>(EMPTY);
  const [pending, startTransition] = useTransition();
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setInviteLink(null);
    setForm(
      employee
        ? {
            id: employee.id,
            firstName: employee.firstName,
            lastName: employee.lastName,
            email: employee.email,
            role: employee.role,
            contractType: employee.contractType,
            weeklyHours: employee.weeklyHours,
            maxHoursPerDay: employee.maxHoursPerDay,
            skills: employee.skills,
            color: employee.color,
          }
        : { ...EMPTY, color: EMPLOYEE_COLORS[Math.floor(Math.random() * EMPLOYEE_COLORS.length)] },
    );
  }, [open, employee]);

  const set = <K extends keyof EmployeeInput>(k: K, v: EmployeeInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  function toggleSkill(s: "INBOUND" | "OUTBOUND", on: boolean) {
    const skills = new Set(form.skills);
    if (on) skills.add(s);
    else skills.delete(s);
    set("skills", [...skills]);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await saveEmployee(form);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success(r.message);
      if (r.data?.inviteUrl) setInviteLink(r.data.inviteUrl);
      else onOpenChange(false);
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{employee ? "Mitarbeiter bearbeiten" : "Neuer Mitarbeiter"}</SheetTitle>
          <SheetDescription>
            {employee ? "Vertragsdaten und Skills anpassen." : "Nach dem Speichern erhält die Person eine Einladung per E-Mail."}
          </SheetDescription>
        </SheetHeader>

        {inviteLink ? (
          <div className="space-y-3 px-4">
            <p className="text-sm">Einladung erstellt. Falls die E-Mail nicht ankommt, kannst du den Link direkt weitergeben:</p>
            <Input readOnly value={inviteLink} onFocus={(e) => e.currentTarget.select()} />
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => navigator.clipboard.writeText(inviteLink).then(() => toast.success("Kopiert"))}
              >
                Link kopieren
              </Button>
              <Button onClick={() => onOpenChange(false)}>Fertig</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-1 flex-col">
            <div className="space-y-5 px-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Vorname">
                  <Input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required />
                </Field>
                <Field label="Nachname">
                  <Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} required />
                </Field>
              </div>
              <Field label="E-Mail">
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Rolle">
                  <Select value={form.role} onValueChange={(v) => set("role", v as EmployeeInput["role"])}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABEL).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Vertrag">
                  <Select
                    value={form.contractType}
                    onValueChange={(v) => set("contractType", v as EmployeeInput["contractType"])}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CONTRACT_LABEL).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Wochenstunden">
                  <Input
                    type="number"
                    step="0.5"
                    min={0}
                    max={48}
                    value={String(form.weeklyHours)}
                    onChange={(e) => set("weeklyHours", e.target.value)}
                  />
                </Field>
                <Field label="Max. Stunden/Tag">
                  <Input
                    type="number"
                    step="0.5"
                    min={1}
                    max={10}
                    value={String(form.maxHoursPerDay)}
                    onChange={(e) => set("maxHoursPerDay", e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Skills" group>
                <div className="flex gap-4 pt-1">
                  {(["INBOUND", "OUTBOUND"] as const).map((s) => (
                    <label key={s} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={form.skills.includes(s)} onCheckedChange={(c) => toggleSkill(s, c === true)} />
                      {SKILL_LABEL[s]}
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="Farbe im Plan" group>
                <div className="flex flex-wrap gap-2 pt-1">
                  {EMPLOYEE_COLORS.map((c) => (
                    <button
                      type="button"
                      key={c}
                      aria-label={`Farbe ${c}`}
                      onClick={() => set("color", c)}
                      className={cn(
                        "size-6 rounded-full ring-offset-2 ring-offset-background transition",
                        form.color === c && "ring-2 ring-foreground",
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </Field>
            </div>
            <SheetFooter className="mt-auto">
              <Button type="submit" disabled={pending}>
                {pending ? "Speichern …" : employee ? "Speichern" : "Anlegen & einladen"}
              </Button>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children, group }: { label: string; children: React.ReactNode; group?: boolean }) {
  if (group) {
    return (
      <div role="group" aria-label={label} className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {children}
      </div>
    );
  }
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
