/**
 * Legt einen Admin-Zugang an (ohne Demo-Daten) und gibt einen Einladungslink zum Setzen des Passworts aus.
 * Aufruf: npm run create-admin -- vorname.nachname@firma.de
 */
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes("@")) {
  console.error("Bitte E-Mail-Adresse angeben: npm run create-admin -- name@firma.de");
  process.exit(1);
}

const db = new PrismaClient();

async function main() {
  await db.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  if ((await db.activityType.count()) === 0) {
    await db.activityType.createMany({
      data: [
        { key: "INBOUND", name: "Inbound", color: "#3b82f6", isPhoneTime: true, isWorkTime: true, isBreak: false, sortOrder: 0 },
        { key: "OUTBOUND", name: "Outbound", color: "#10b981", isPhoneTime: false, isWorkTime: true, isBreak: false, sortOrder: 1 },
        { key: "BREAK", name: "Pause", color: "#a1a1aa", isPhoneTime: false, isWorkTime: false, isBreak: true, sortOrder: 2 },
        { key: "BACKOFFICE", name: "Backoffice", color: "#f59e0b", isPhoneTime: false, isWorkTime: true, isBreak: false, sortOrder: 3 },
        { key: "TRAINING", name: "Schulung", color: "#8b5cf6", isPhoneTime: false, isWorkTime: true, isBreak: false, sortOrder: 4 },
        { key: "MEETING", name: "Meeting", color: "#ec4899", isPhoneTime: false, isWorkTime: true, isBreak: false, sortOrder: 5 },
      ],
    });
  }
  const inviteToken = randomBytes(24).toString("base64url");
  await db.user.upsert({
    where: { email },
    update: { role: "ADMIN", active: true, inviteToken, inviteExpires: new Date(Date.now() + 7 * 86_400_000) },
    create: { email, role: "ADMIN", inviteToken, inviteExpires: new Date(Date.now() + 7 * 86_400_000) },
  });
  const base = process.env.APP_URL ?? "http://localhost:3000";
  console.log(`Admin ${email} angelegt. Passwort festlegen (7 Tage gültig):\n${base}/einladung/${inviteToken}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
