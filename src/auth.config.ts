import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";

/** Edge-taugliche Basis-Konfiguration (ohne DB-Zugriff), wird auch von der Middleware genutzt. */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isPublic =
        pathname === "/demo" ||
        pathname.startsWith("/login") ||
        pathname.startsWith("/einladung") ||
        pathname.startsWith("/api/auth") ||
        // API-Routen prüfen die Anmeldung selbst und antworten mit 401 statt Weiterleitung
        pathname.startsWith("/api/updates");
      if (isPublic) return true;
      if (!auth?.user) return false;
      if (pathname.startsWith("/admin") || pathname.startsWith("/bedarf") || pathname.startsWith("/antraege")) {
        return auth.user.role === "ADMIN" || auth.user.role === "TEAMLEAD";
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.employeeId = user.employeeId ?? null;
        token.name = user.name;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub!;
      session.user.role = token.role as Role;
      session.user.employeeId = (token.employeeId as string | null) ?? null;
      return session;
    },
  },
} satisfies NextAuthConfig;
