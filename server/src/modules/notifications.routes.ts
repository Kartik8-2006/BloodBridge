import { Router } from 'express';
import { z } from 'zod';
import { currentUser } from '../middleware/auth.js';
import { parse } from '../lib/validate.js';
import { ApiError } from '../lib/errors.js';
import type { Deps } from '../deps.js';

export function notificationsRouter(d: Deps) {
  const r = Router();

  r.get('/', async (req, res) => {
    const me = currentUser(req);
    const { limit, cursor, unreadOnly } = parse(
      z.object({
        limit: z.coerce.number().int().min(1).max(50).default(20),
        cursor: z.string().optional(),
        unreadOnly: z.enum(['true', 'false']).default('false'),
      }),
      req.query,
    );
    const rows = await d.db.notification.findMany({
      where: { userId: me.id, ...(unreadOnly === 'true' ? { readAt: null } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, limit);
    const unread = await d.db.notification.count({ where: { userId: me.id, readAt: null } });
    res.json({ items, nextCursor: rows.length > limit ? items[items.length - 1]!.id : null, unread });
  });

  r.post('/read-all', async (req, res) => {
    const result = await d.db.notification.updateMany({ where: { userId: currentUser(req).id, readAt: null }, data: { readAt: new Date() } });
    res.json({ updated: result.count });
  });

  r.post('/:id/read', async (req, res) => {
    const result = await d.db.notification.updateMany({
      where: { id: String(req.params.id), userId: currentUser(req).id, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      const exists = await d.db.notification.findFirst({ where: { id: String(req.params.id), userId: currentUser(req).id } });
      if (!exists) throw ApiError.notFound();
    }
    res.json({ ok: true });
  });

  return r;
}
