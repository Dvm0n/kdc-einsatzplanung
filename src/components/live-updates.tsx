"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const INTERVAL_MS = 20_000;

type UpdateResponse = {
  now: string;
  unread: number;
  pending: number;
  fresh: { id: string; title: string; body: string | null; link: string | null; createdAt: string }[];
};

/**
 * Fragt regelmäßig (nur bei sichtbarem Tab) nach Neuigkeiten.
 * Bei neuen Benachrichtigungen oder geänderten Zählern: Einblendung + Seite im Hintergrund aktualisieren.
 */
export function LiveUpdates({ unread, pending }: { unread: number; pending: number }) {
  const router = useRouter();
  const since = useRef(new Date().toISOString());
  const known = useRef({ unread, pending });
  const busy = useRef(false);

  // Server-Werte nach jeder Aktualisierung übernehmen (z. B. nach eigenem Klick auf die Glocke)
  useEffect(() => {
    known.current = { unread, pending };
  }, [unread, pending]);

  useEffect(() => {
    async function poll() {
      if (busy.current || document.hidden) return;
      busy.current = true;
      try {
        const res = await fetch(`/api/updates?since=${encodeURIComponent(since.current)}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as UpdateResponse;
        since.current = data.now;

        for (const n of [...data.fresh].reverse().slice(-3)) {
          toast(n.title, {
            description: n.body ?? undefined,
            action: n.link ? { label: "Öffnen", onClick: () => router.push(n.link!) } : undefined,
          });
        }
        const changed =
          data.fresh.length > 0 || data.unread !== known.current.unread || data.pending !== known.current.pending;
        known.current = { unread: data.unread, pending: data.pending };
        if (changed) router.refresh();
      } catch {
        // offline o. Ä. – beim nächsten Durchlauf erneut versuchen
      } finally {
        busy.current = false;
      }
    }

    const timer = window.setInterval(poll, INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [router]);

  return null;
}
