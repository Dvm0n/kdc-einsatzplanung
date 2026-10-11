import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export async function audit(
  userId: string | null,
  action: string,
  entity: string,
  entityId?: string | null,
  data?: Prisma.InputJsonValue,
) {
  await db.auditLog.create({ data: { userId, action, entity, entityId: entityId ?? null, data } });
}
