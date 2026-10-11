"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { markNotificationsRead } from "@/app/(app)/mein-plan/actions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
  read: boolean;
};

export function NotificationBell({ items, unread }: { items: NotificationItem[]; unread: number }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o && unread > 0) void markNotificationsRead();
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Benachrichtigungen${unread ? ` (${unread} neu)` : ""}`}>
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b px-4 py-3 text-sm font-medium">Benachrichtigungen</div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nichts Neues.</p>}
          {items.map((n) => {
            const content = (
              <div className={cn("flex gap-3 px-4 py-3 transition hover:bg-muted/50", !n.read && "bg-primary/5")}>
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")} />
                <div className="min-w-0">
                  <div className="text-sm font-medium">{n.title}</div>
                  {n.body && <div className="text-xs text-muted-foreground">{n.body}</div>}
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: de })}
                  </div>
                </div>
              </div>
            );
            return n.link ? (
              <Link key={n.id} href={n.link} onClick={() => setOpen(false)} className="block border-b last:border-b-0">
                {content}
              </Link>
            ) : (
              <div key={n.id} className="border-b last:border-b-0">
                {content}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
