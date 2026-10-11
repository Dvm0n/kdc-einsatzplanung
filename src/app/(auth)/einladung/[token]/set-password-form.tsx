"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setPasswordAction } from "./actions";

export function SetPasswordForm({ token, email }: { token: string; email: string }) {
  const [error, action, pending] = useActionState(setPasswordAction, null);
  return (
    <form action={action} className="space-y-4 rounded-2xl border bg-card p-6 shadow-xs">
      <input type="hidden" name="token" value={token} />
      <div className="space-y-2">
        <Label>E-Mail</Label>
        <Input value={email} disabled />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Neues Passwort</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        <p className="text-xs text-muted-foreground">Mindestens 10 Zeichen.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Passwort wiederholen</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Speichern …" : "Passwort festlegen"}
      </Button>
    </form>
  );
}
