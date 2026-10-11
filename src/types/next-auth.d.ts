import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: Role;
    employeeId?: string | null;
  }
  interface Session {
    user: {
      id: string;
      role: Role;
      employeeId: string | null;
    } & DefaultSession["user"];
  }
}
