import { redirect } from "next/navigation";
import { auth } from "@/auth";

export async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user;
}

export function isPlanner(role: string) {
  return role === "ADMIN" || role === "TEAMLEAD";
}

export async function requirePlanner() {
  const user = await requireUser();
  if (!isPlanner(user.role)) redirect("/plan");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/plan");
  return user;
}
