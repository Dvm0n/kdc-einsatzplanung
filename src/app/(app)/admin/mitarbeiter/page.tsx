import { db } from "@/lib/db";
import { EmployeeList } from "./employee-list";

export default async function EmployeesPage() {
  const employees = await db.employee.findMany({
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { lastName: "asc" }],
    include: { user: { select: { email: true, role: true, passwordHash: true } } },
  });

  const rows = employees.map((e) => ({
    id: e.id,
    firstName: e.firstName,
    lastName: e.lastName,
    color: e.color,
    contractType: e.contractType,
    weeklyHours: e.weeklyHours,
    maxHoursPerDay: e.maxHoursPerDay,
    skills: e.skills,
    active: e.active,
    email: e.user?.email ?? "",
    role: e.user?.role ?? "OPERATOR",
    invited: !!e.user && !e.user.passwordHash,
  }));

  return <EmployeeList employees={rows} />;
}
