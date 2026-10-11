"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CalendarCheck, Clock, Inbox, LineChart, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number };

const ICONS = {
  plan: CalendarDays,
  mine: CalendarCheck,
  availability: Clock,
  requests: Inbox,
  demand: LineChart,
  settings: Settings,
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              active && "bg-accent font-medium text-foreground",
            )}
          >
            <Icon className="size-4" />
            <span className="flex-1">{item.label}</span>
            {!!item.badge && (
              <span className="rounded-full bg-primary px-1.5 text-[11px] font-medium leading-5 text-primary-foreground">
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {items.slice(0, 5).map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-1 py-2 text-[11px] text-muted-foreground",
              active && "text-primary",
            )}
          >
            <Icon className="size-5" />
            {item.label}
            {!!item.badge && <span className="absolute top-1.5 right-[30%] size-2 rounded-full bg-primary" />}
          </Link>
        );
      })}
    </nav>
  );
}
