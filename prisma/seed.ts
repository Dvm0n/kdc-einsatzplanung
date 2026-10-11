/**
 * Demo-Daten für die lokale Entwicklung.
 * Logins (nur lokal/Test): admin@kdc.local bzw. <vorname>@kdc.local, Passwort = SEED_PASSWORD (Standard unten).
 */
import { PrismaClient, type ContractType, type Skill } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "kdc-demo-2026";

const h = (hh: number, mm = 0) => hh * 60 + mm;

function utcDate(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m - 1, d));
}
function addDays(d: Date, n: number) {
  return new Date(d.getTime() + n * 86_400_000);
}
function mondayOf(d: Date) {
  const day = d.getUTCDay() || 7;
  return addDays(utcDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()), 1 - day);
}

// deterministischer Zufall
let seed = 42;
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

const operators: {
  firstName: string;
  lastName: string;
  color: string;
  contractType: ContractType;
  weeklyHours: number;
  skills: Skill[];
}[] = [
  { firstName: "Anna", lastName: "Becker", color: "#6366f1", contractType: "FULLTIME", weeklyHours: 39, skills: ["INBOUND", "OUTBOUND"] },
  { firstName: "Jonas", lastName: "Wolf", color: "#0ea5e9", contractType: "PARTTIME", weeklyHours: 30, skills: ["INBOUND", "OUTBOUND"] },
  { firstName: "Lea", lastName: "Schröder", color: "#14b8a6", contractType: "PARTTIME", weeklyHours: 25, skills: ["INBOUND"] },
  { firstName: "Murat", lastName: "Yilmaz", color: "#f59e0b", contractType: "PARTTIME", weeklyHours: 20, skills: ["INBOUND", "OUTBOUND"] },
  { firstName: "Sophie", lastName: "Neumann", color: "#ec4899", contractType: "PARTTIME", weeklyHours: 20, skills: ["INBOUND"] },
  { firstName: "Tim", lastName: "Hoffmann", color: "#84cc16", contractType: "PARTTIME", weeklyHours: 25, skills: ["OUTBOUND", "INBOUND"] },
  { firstName: "Katrin", lastName: "Lange", color: "#8b5cf6", contractType: "PARTTIME", weeklyHours: 30, skills: ["INBOUND", "OUTBOUND"] },
  { firstName: "David", lastName: "Krause", color: "#ef4444", contractType: "PARTTIME", weeklyHours: 20, skills: ["INBOUND"] },
  { firstName: "Elif", lastName: "Demir", color: "#06b6d4", contractType: "MINIJOB", weeklyHours: 10, skills: ["INBOUND"] },
  { firstName: "Paul", lastName: "Richter", color: "#a855f7", contractType: "PARTTIME", weeklyHours: 20, skills: ["INBOUND", "OUTBOUND"] },
];

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  await db.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  // Call-Zeiten: Mo–Fr 08–18, Sa 09–13
  await db.serviceHours.deleteMany();
  await db.serviceHours.createMany({
    data: [
      ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMin: h(8), endMin: h(18) })),
      { weekday: 6, startMin: h(9), endMin: h(13) },
    ],
  });

  const activities = [
    { key: "INBOUND", name: "Inbound", color: "#3b82f6", isPhoneTime: true, isWorkTime: true, isBreak: false },
    { key: "OUTBOUND", name: "Outbound", color: "#10b981", isPhoneTime: false, isWorkTime: true, isBreak: false },
    { key: "BREAK", name: "Pause", color: "#a1a1aa", isPhoneTime: false, isWorkTime: false, isBreak: true },
    { key: "BACKOFFICE", name: "Backoffice", color: "#f59e0b", isPhoneTime: false, isWorkTime: true, isBreak: false },
    { key: "TRAINING", name: "Schulung", color: "#8b5cf6", isPhoneTime: false, isWorkTime: true, isBreak: false },
    { key: "MEETING", name: "Meeting", color: "#ec4899", isPhoneTime: false, isWorkTime: true, isBreak: false },
  ];
  for (const [i, a] of activities.entries()) {
    await db.activityType.upsert({ where: { key: a.key }, update: {}, create: { ...a, sortOrder: i } });
  }
  const inbound = await db.activityType.findUniqueOrThrow({ where: { key: "INBOUND" } });
  const outbound = await db.activityType.findUniqueOrThrow({ where: { key: "OUTBOUND" } });

  if ((await db.shiftTemplate.count()) === 0) {
    await db.shiftTemplate.createMany({
      data: [
        { name: "Vormittag", startMin: h(8), endMin: h(12), activityTypeId: inbound.id, sortOrder: 0 },
        { name: "Nachmittag", startMin: h(14), endMin: h(18), activityTypeId: inbound.id, sortOrder: 1 },
        { name: "Mittag", startMin: h(11), endMin: h(15), activityTypeId: inbound.id, sortOrder: 2 },
        { name: "Früh lang", startMin: h(8), endMin: h(14, 30), activityTypeId: inbound.id, sortOrder: 3 },
        { name: "Spät lang", startMin: h(11, 30), endMin: h(18), activityTypeId: inbound.id, sortOrder: 4 },
        { name: "Ganztag", startMin: h(8), endMin: h(16, 30), activityTypeId: inbound.id, sortOrder: 5 },
        { name: "Samstag", startMin: h(9), endMin: h(13), activityTypeId: inbound.id, sortOrder: 6 },
        { name: "Outbound Nachmittag", startMin: h(13), endMin: h(17), activityTypeId: outbound.id, sortOrder: 7 },
      ],
    });
  }

  await db.user.upsert({
    where: { email: "admin@kdc.local" },
    update: {},
    create: { email: "admin@kdc.local", passwordHash, role: "ADMIN" },
  });

  for (const [i, o] of operators.entries()) {
    const email = `${o.firstName.toLowerCase()}@kdc.local`;
    const user = await db.user.upsert({
      where: { email },
      update: {},
      create: { email, passwordHash, role: "OPERATOR" },
    });
    await db.employee.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        ...o,
        userId: user.id,
        sortOrder: i,
        maxHoursPerDay: o.contractType === "FULLTIME" ? 9 : 8,
      },
    });
  }

  // Anrufhistorie: die letzten 10 Wochen vor der aktuellen Woche
  if ((await db.callHistory.count()) === 0) {
    const thisMonday = mondayOf(new Date());
    const from = addDays(thisMonday, -70);
    const dayFactor = [0, 1.25, 1.05, 1.0, 0.95, 0.9, 0.45, 0]; // Index = ISO-Wochentag
    const rows: { date: Date; startMin: number; offered: number; handled: number; ahtSeconds: number }[] = [];
    for (let d = 0; d < 70; d++) {
      const date = addDays(from, d);
      const wd = date.getUTCDay() || 7;
      if (wd === 7) continue;
      const open = wd === 6 ? h(9) : h(8);
      const close = wd === 6 ? h(13) : h(18);
      for (let m = open; m < close; m += 30) {
        const hour = m / 60;
        // Tagesverlauf: Spitze ~10:30, zweite Spitze ~14:30, Mittagsdelle
        const curve =
          6 + 14 * Math.exp(-((hour - 10.5) ** 2) / 2.5) + 9 * Math.exp(-((hour - 14.5) ** 2) / 3) - 2 * Math.exp(-((hour - 12.5) ** 2) / 0.5);
        const trend = 1 + (d / 70) * 0.08; // leichter Anstieg
        const offered = Math.max(0, Math.round(curve * dayFactor[wd] * trend * (0.85 + rand() * 0.3)));
        const handled = Math.round(offered * (0.93 + rand() * 0.06));
        const ahtSeconds = Math.round(230 + rand() * 60);
        rows.push({ date, startMin: m, offered, handled, ahtSeconds });
      }
    }
    const batch = await db.importBatch.create({
      data: { fileName: "demo-historie.csv", rowCount: rows.length, fromDate: from, toDate: addDays(thisMonday, -1) },
    });
    await db.callHistory.createMany({ data: rows.map((r) => ({ ...r, batchId: batch.id })) });
  }

  const thisMonday = mondayOf(new Date());
  await seedDemoWeek(thisMonday);
  await seedDemoWeek(addDays(thisMonday, 7));

  console.log("Seed fertig.");
}

/** Veröffentlichter Beispielplan für eine Woche */
async function seedDemoWeek(weekStart: Date) {
  const existing = await db.shift.count({ where: { date: { gte: weekStart, lte: addDays(weekStart, 6) } } });
  if (existing > 0) return;

  const act = Object.fromEntries((await db.activityType.findMany()).map((a) => [a.key, a.id]));
  const emps = Object.fromEntries((await db.employee.findMany()).map((e) => [e.firstName, e.id]));
  const week = await db.scheduleWeek.upsert({
    where: { weekStart },
    update: {},
    create: { weekStart, status: "PUBLISHED", version: 1, publishedAt: new Date() },
  });

  type Plan = { name: string; days: number[]; start: number; end: number; outboundFrom?: number };
  const plans: Plan[] = [
    { name: "Anna", days: [1, 2, 3, 4, 5], start: h(8), end: h(16, 30) },
    { name: "Jonas", days: [1, 2, 3, 4, 5], start: h(11, 30), end: h(18) },
    { name: "Lea", days: [1, 2, 3, 4, 5], start: h(8), end: h(13) },
    { name: "Murat", days: [1, 2, 3, 4, 5], start: h(14), end: h(18) },
    { name: "Sophie", days: [1, 2, 3, 4, 5], start: h(8), end: h(12) },
    { name: "Tim", days: [1, 2, 3, 4, 5], start: h(13), end: h(18), outboundFrom: h(15) },
    { name: "Katrin", days: [1, 2, 3, 4, 5], start: h(8), end: h(14, 30) },
    { name: "David", days: [1, 2, 3, 4], start: h(12), end: h(17) },
    { name: "Elif", days: [3], start: h(14), end: h(18) },
    { name: "Elif", days: [6], start: h(9), end: h(13) },
    { name: "Elif", days: [5], start: h(16), end: h(18) },
    { name: "Paul", days: [2, 3, 4, 5], start: h(10), end: h(14) },
    { name: "Paul", days: [6], start: h(9), end: h(13) },
  ];

  for (const p of plans) {
    for (const wd of p.days) {
      const gross = p.end - p.start;
      const brk = gross - 30 > 540 ? 45 : gross > 360 ? 30 : 0;
      const segments: { activityTypeId: string; startMin: number; endMin: number }[] = [];
      if (brk) {
        const bs = Math.round((p.start + (gross - brk) / 2) / 15) * 15;
        segments.push(
          { activityTypeId: act.INBOUND, startMin: p.start, endMin: bs },
          { activityTypeId: act.BREAK, startMin: bs, endMin: bs + brk },
          { activityTypeId: act.INBOUND, startMin: bs + brk, endMin: p.end },
        );
      } else if (p.outboundFrom) {
        segments.push(
          { activityTypeId: act.INBOUND, startMin: p.start, endMin: p.outboundFrom },
          { activityTypeId: act.OUTBOUND, startMin: p.outboundFrom, endMin: p.end },
        );
      } else {
        segments.push({ activityTypeId: act.INBOUND, startMin: p.start, endMin: p.end });
      }
      await db.shift.create({
        data: {
          weekId: week.id,
          employeeId: emps[p.name],
          date: addDays(weekStart, wd - 1),
          startMin: p.start,
          endMin: p.end,
          segments: { create: segments },
        },
      });
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
