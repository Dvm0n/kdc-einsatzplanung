import { BottomNav, SidebarNav, type NavItem } from "@/components/app-nav";
import { LiveUpdates } from "@/components/live-updates";
import { NotificationBell, type NotificationItem } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { db } from "@/lib/db";
import { isPlanner, requireUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const planner = isPlanner(user.role);

  // alle Abfragen gleichzeitig – jede Runde zur Datenbank kostet Zeit
  const [notifications, unread, changes, absences, swaps, bids] = await Promise.all([
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 15 }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    planner
      ? db.changeRequest.count({ where: { status: { in: ["PENDING", "PEER_ACCEPTED"] }, type: { not: "SWAP" } } })
      : 0,
    planner ? db.absenceRequest.count({ where: { status: "PENDING" } }) : 0,
    planner ? db.changeRequest.count({ where: { status: "PEER_ACCEPTED", type: "SWAP" } }) : 0,
    // Schichtbörse: offene Schichten mit Meldungen warten auf Zuteilung
    planner ? db.openShift.count({ where: { status: "OPEN", bids: { some: {} } } }) : 0,
  ]);
  const pending = changes + absences + swaps + bids;
  const notificationItems: NotificationItem[] = notifications.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    link: n.link,
    createdAt: n.createdAt.toISOString(),
    read: !!n.readAt,
  }));
  const bell = <NotificationBell items={notificationItems} unread={unread} />;

  const items: NavItem[] = [{ href: "/plan", label: "Wochenplan", icon: "plan" }];
  if (user.employeeId) {
    items.push({ href: "/mein-plan", label: "Mein Plan", icon: "mine" });
    items.push({ href: "/verfuegbarkeit", label: "Verfügbarkeit", icon: "availability" });
  }
  if (planner) {
    items.push({ href: "/antraege", label: "Anträge", icon: "requests", badge: pending });
    items.push({ href: "/bedarf", label: "Bedarf", icon: "demand" });
  }
  if (user.role === "ADMIN") items.push({ href: "/admin", label: "Verwaltung", icon: "settings" });

  return (
    <div className="flex min-h-svh">
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r bg-sidebar px-3 py-4 md:flex">
        <div className="mb-6 flex items-center gap-2 pr-1 pl-3">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-[11px] font-semibold text-primary-foreground">
            KDC
          </div>
          <span className="flex-1 text-sm font-semibold tracking-tight">Einsatzplanung</span>
          {bell}
        </div>
        <SidebarNav items={items} />
        <div className="mt-auto space-y-3 border-t pt-4">
          <div className="flex justify-end px-1">
            <ThemeToggle />
          </div>
          <div className="px-1">
            <UserMenu name={user.name ?? user.email ?? ""} role={user.role} />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/95 px-4 py-2 backdrop-blur md:hidden">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-[11px] font-semibold text-primary-foreground">
              KDC
            </div>
            <span className="text-sm font-semibold">Einsatzplanung</span>
          </div>
          <div className="flex items-center gap-1">
            {bell}
            <ThemeToggle />
            <UserMenu name={user.name ?? ""} role={user.role} compact />
          </div>
        </header>
        <main className="flex-1 px-4 pt-6 pb-24 md:px-8 md:pb-10">{children}</main>
      </div>

      <BottomNav items={items} />
      <LiveUpdates unread={unread} pending={pending} />
    </div>
  );
}
