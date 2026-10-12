/**
 * Einmalige Anpassung der Demo-Daten: Call-Zeiten nur Mo–Fr.
 * - entfernt Sa/So-Call-Zeiten
 * - verlegt Wochenendschichten der Demo (Elif → Do 14–18, Paul → Mo 10–14), sonst werden sie entfernt
 * - speichert für veröffentlichte Wochen ohne Stand den Veröffentlichungsstand
 * Aufruf: npx tsx scripts/demo-werktage.ts (nutzt DATABASE_URL)
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const DAY = 86_400_000;
const h = (x: number) => x * 60;

async function main() {
  const removedHours = await db.serviceHours.deleteMany({ where: { weekday: { gte: 6 } } });

  const shifts = await db.shift.findMany({ include: { employee: true, segments: true } });
  const weekend = shifts.filter((s) => [0, 6].includes(s.date.getUTCDay()));
  let moved = 0;
  let removed = 0;
  for (const s of weekend) {
    const monday = new Date(s.date.getTime() - ((s.date.getUTCDay() + 6) % 7) * DAY);
    const target =
      s.employee.firstName === "Elif"
        ? { date: new Date(monday.getTime() + 3 * DAY), start: h(14), end: h(18) }
        : s.employee.firstName === "Paul"
          ? { date: monday, start: h(10), end: h(14) }
          : null;
    const free =
      target &&
      !(await db.shift.findFirst({
        where: { employeeId: s.employeeId, date: target.date, startMin: { lt: target.end }, endMin: { gt: target.start } },
      }));
    if (target && free) {
      const act = s.segments[0]?.activityTypeId;
      await db.$transaction([
        db.shiftSegment.deleteMany({ where: { shiftId: s.id } }),
        db.shift.update({
          where: { id: s.id },
          data: {
            date: target.date,
            startMin: target.start,
            endMin: target.end,
            segments: { create: [{ activityTypeId: act, startMin: target.start, endMin: target.end }] },
          },
        }),
      ]);
      moved++;
    } else {
      await db.shift.delete({ where: { id: s.id } });
      removed++;
    }
  }

  const weeks = await db.scheduleWeek.findMany({ where: { status: "PUBLISHED" } });
  let snap = 0;
  for (const w of weeks) {
    if (w.publishedSnapshot) continue;
    const ws = await db.shift.findMany({
      where: { date: { gte: w.weekStart, lte: new Date(w.weekStart.getTime() + 6 * DAY) } },
      include: { segments: true },
    });
    await db.scheduleWeek.update({
      where: { id: w.id },
      data: {
        publishedSnapshot: ws.map((s) => ({
          id: s.id,
          employeeId: s.employeeId,
          date: s.date.toISOString().slice(0, 10),
          startMin: s.startMin,
          endMin: s.endMin,
          segments: s.segments.map(({ activityTypeId, startMin, endMin }) => ({ activityTypeId, startMin, endMin })),
        })),
      },
    });
    snap++;
  }
  console.log({ removedServiceHours: removedHours.count, moved, removed, snapshots: snap });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
