import { PageHeader } from "@/components/page-header";
import { requireAdmin } from "@/lib/session";
import { AdminTabs } from "./admin-tabs";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Verwaltung" description="Mitarbeiter, Call-Zeiten, Planungsparameter und Vorlagen." />
      <AdminTabs />
      <div className="mt-6">{children}</div>
    </div>
  );
}
