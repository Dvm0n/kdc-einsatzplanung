"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/mitarbeiter", label: "Mitarbeiter" },
  { href: "/admin/einstellungen", label: "Call-Zeiten & Parameter" },
  { href: "/admin/vorlagen", label: "Schichten & Aktivitäten" },
  { href: "/admin/auswertung", label: "Auswertung" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px border-b-2 border-transparent px-3 py-2 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
              active && "border-primary font-medium text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
