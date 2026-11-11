import type { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

type Db = Prisma.TransactionClient | typeof prisma;

export async function notify(
  userId: string,
  input: { type?: NotificationType; title: string; body: string; link?: string },
  db: Db = prisma,
) {
  return db.notification.create({
    data: { userId, type: input.type ?? 'SYSTEM', title: input.title, body: input.body, link: input.link ?? null },
  });
}

export async function audit(
  actorId: string | null,
  action: string,
  entity: string,
  entityId?: string,
  meta?: Prisma.InputJsonValue,
  db: Db = prisma,
) {
  return db.auditLog.create({
    data: { actorId, action, entity, entityId: entityId ?? null, ...(meta !== undefined ? { meta } : {}) },
  });
}
