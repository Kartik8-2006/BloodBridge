import type { Db } from '../lib/prisma.js';
import { realtime } from './realtime.js';
import type { NotificationType, Prisma } from '../generated/prisma/client.js';

export interface NotificationInput {
  type: NotificationType;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
}

export async function notify(db: Db, userId: string, input: NotificationInput) {
  const created = await db.notification.create({
    data: { userId, type: input.type, title: input.title, body: input.body, data: input.data },
  });
  realtime().toUsers([userId], 'notification', { type: input.type });
  return created;
}

export async function notifyMany(db: Db, userIds: string[], input: NotificationInput) {
  if (!userIds.length) return;
  await db.notification.createMany({
    data: userIds.map((userId) => ({ userId, type: input.type, title: input.title, body: input.body, data: input.data })),
  });
  realtime().toUsers(userIds, 'notification', { type: input.type });
}

export async function notifyAdmins(db: Db, input: NotificationInput) {
  const admins = await db.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true } });
  await notifyMany(db, admins.map((a) => a.id), input);
}

export async function audit(
  db: Db,
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string,
  meta?: Prisma.InputJsonValue,
) {
  await db.auditLog.create({ data: { actorId, action, entity, entityId, meta } });
}
