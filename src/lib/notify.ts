import { db } from "@/lib/db";
import { sendMail } from "@/lib/mail";

export async function notifyUsers(
  userIds: string[],
  n: { title: string; body?: string; link?: string },
  opts: { email?: boolean } = {},
) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return;
  await db.notification.createMany({ data: ids.map((userId) => ({ userId, ...n })) });
  if (opts.email) {
    const users = await db.user.findMany({ where: { id: { in: ids }, active: true } });
    const base = process.env.APP_URL ?? "http://localhost:3000";
    await Promise.all(
      users.map((u) =>
        sendMail({ to: u.email, subject: n.title, text: `${n.body ?? ""}${n.link ? `\n\n${base}${n.link}` : ""}` }),
      ),
    );
  }
}

export async function notifyEmployees(employeeIds: string[], n: { title: string; body?: string; link?: string }, opts?: { email?: boolean }) {
  const emps = await db.employee.findMany({ where: { id: { in: employeeIds } }, select: { userId: true } });
  await notifyUsers(emps.map((e) => e.userId!).filter(Boolean), n, opts);
}

export async function notifyPlanners(n: { title: string; body?: string; link?: string }) {
  const planners = await db.user.findMany({ where: { role: { in: ["ADMIN", "TEAMLEAD"] }, active: true } });
  await notifyUsers(planners.map((p) => p.id), n);
}
