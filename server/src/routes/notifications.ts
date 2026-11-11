import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireUser);

notificationsRouter.get('/', async (req, res) => {
  const userId = req.dbUser!.id;
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  res.json({ items, unread });
});

notificationsRouter.post('/read-all', async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.dbUser!.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true });
});

notificationsRouter.post('/:id/read', async (req, res) => {
  await prisma.notification.updateMany({
    where: { id: String(req.params.id), userId: req.dbUser!.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ ok: true });
});
