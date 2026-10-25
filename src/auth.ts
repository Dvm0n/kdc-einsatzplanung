import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { db } from "@/lib/db";
import { demoAccount, publicDemoEnabled } from "@/lib/public-demo";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      id: "portfolio-demo",
      credentials: { role: {} },
      async authorize(raw) {
        if (!publicDemoEnabled()) return null;
        const account = demoAccount(raw.role);
        if (!account) return null;
        const user = await db.user.findUnique({ where: { email: account.email }, include: { employee: true } });
        if (!user?.active || user.role !== account.role) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.employee ? `${user.employee.firstName} ${user.employee.lastName}` : "Administrator",
          role: user.role,
          employeeId: user.employee?.id ?? null,
        };
      },
    }),
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await db.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
          include: { employee: true },
        });
        if (!user || !user.active || !user.passwordHash) return null;
        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.employee ? `${user.employee.firstName} ${user.employee.lastName}` : "Administrator",
          role: user.role,
          employeeId: user.employee?.id ?? null,
        };
      },
    }),
  ],
});
