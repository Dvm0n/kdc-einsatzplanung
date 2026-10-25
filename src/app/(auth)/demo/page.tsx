import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { publicDemoEnabled } from "@/lib/public-demo";
import { enterDemo } from "./actions";

export const dynamic = "force-dynamic";

export default function DemoPage() {
  if (!publicDemoEnabled()) notFound();
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground">KDC</div>
          <h1 className="text-xl font-semibold tracking-tight">Einsatzplanung ausprobieren</h1>
          <p className="text-sm text-muted-foreground">Die vollständige Originalanwendung mit fiktiven Beispieldaten.</p>
        </div>
        <div className="space-y-5 rounded-2xl border bg-card p-6 shadow-xs">
          <form action={enterDemo}>
            <input type="hidden" name="role" value="planner" />
            <Button className="w-full" type="submit">Als Planer / Administrator starten</Button>
            <p className="mt-2 text-xs text-muted-foreground">Wochen- und Tagesplan, Bedarfsprognose, Planvorschläge, Anträge, Schichtbörse und Verwaltung.</p>
          </form>
          <form action={enterDemo}>
            <input type="hidden" name="role" value="operator" />
            <Button className="w-full" variant="outline" type="submit">Als Operator starten</Button>
            <p className="mt-2 text-xs text-muted-foreground">Eigener Plan, Verfügbarkeit, Urlaub, Änderungsanträge und Schichtübernahmen.</p>
          </form>
          <p className="border-t pt-4 text-xs leading-relaxed text-muted-foreground">Dies ist eine gemeinsam genutzte Testumgebung. Änderungen werden gespeichert und sind für andere Besucher sichtbar. Bitte ausschließlich erfundene Angaben verwenden. E-Mails werden nicht versendet. Zum Rollenwechsel kannst du diese Seite erneut öffnen.</p>
        </div>
        <a className="block text-center text-sm text-muted-foreground underline underline-offset-4" href="https://www.koehler.vc/projekte/">Zurück zum Portfolio</a>
      </div>
    </main>
  );
}
