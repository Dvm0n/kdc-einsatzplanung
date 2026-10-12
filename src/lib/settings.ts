import { cache } from "react";
import { db } from "@/lib/db";

/**
 * Einstellungen (Singleton). Pro Anfrage nur einmal geladen (React cache);
 * angelegt wird der Datensatz nur, falls er noch fehlt.
 */
export const getSettings = cache(async () => {
  return (
    (await db.settings.findUnique({ where: { id: 1 } })) ??
    (await db.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }))
  );
});

export type AppSettings = Awaited<ReturnType<typeof getSettings>>;
