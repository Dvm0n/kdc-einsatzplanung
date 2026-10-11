"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "./actions";

export function LoginForm() {
  const [error, action, pending] = useActionState(loginAction, null);

  return (
    <form action={action} className="space-y-4 rounded-2xl border bg-card p-6 shadow-xs">
      <div className="space-y-2">
        <Label htmlFor="email">E-Mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Passwort</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Anmelden …" : "Anmelden"}
      </Button>
    </form>
  );
}
