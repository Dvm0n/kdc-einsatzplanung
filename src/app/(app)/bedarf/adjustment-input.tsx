"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { setAdjustment } from "./actions";

export function AdjustmentInput({ date, initial }: { date: string; initial: number }) {
  const [value, setValue] = useState(String(initial));
  const [pending, startTransition] = useTransition();

  function commit() {
    const n = Number(value.replace(",", "."));
    if (!Number.isFinite(n) || n === initial) return;
    startTransition(async () => {
      const r = await setAdjustment(date, n);
      if (!r.ok) toast.error(r.error);
      else toast.success(r.message);
    });
  }

  return (
    <label className="relative block">
      <span className="sr-only">Korrektur in Prozent</span>
      <Input
        inputMode="numeric"
        className="h-7 pr-6 text-xs"
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      />
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">%</span>
    </label>
  );
}
