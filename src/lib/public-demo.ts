/** Only the separate portfolio deployment may expose password-free sample accounts. */
export function publicDemoEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.DEMO_MODE !== "true") return false;
  try {
    return [env.DATABASE_URL, env.DATABASE_URL_UNPOOLED].every((value) => {
      if (!value) return false;
      const url = new URL(value);
      return url.protocol === "postgresql:" && url.pathname === "/portfolio_demo" && url.username === "portfolio_demo_app";
    });
  } catch {
    return false;
  }
}

export function demoAccount(role: unknown): { email: string; role: "ADMIN" | "OPERATOR" } | null {
  if (role === "planner") return { email: "admin@kdc.local", role: "ADMIN" };
  if (role === "operator") return { email: "tim@kdc.local", role: "OPERATOR" };
  return null;
}
