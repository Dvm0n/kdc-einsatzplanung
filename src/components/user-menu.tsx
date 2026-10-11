import { LogOut } from "lucide-react";
import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL } from "@/lib/labels";

export function UserMenu({ name, role, compact }: { name: string; role: string; compact?: boolean }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const logout = (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <Button variant="ghost" size="icon" aria-label="Abmelden">
        <LogOut className="size-4" />
      </Button>
    </form>
  );
  if (compact) return logout;
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
        {initials}
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-medium">{name}</div>
        <div className="text-xs text-muted-foreground">{ROLE_LABEL[role] ?? role}</div>
      </div>
      {logout}
    </div>
  );
}
