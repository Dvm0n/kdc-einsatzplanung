import { db } from "@/lib/db";

export async function getSettings() {
  return db.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

export type AppSettings = Awaited<ReturnType<typeof getSettings>>;
