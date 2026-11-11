import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { Deps } from '../deps.js';
import { logger } from '../lib/logger.js';

/** Pushes small "something changed" events to signed-in users. Data is always re-fetched over the API. */
export interface Realtime {
  toUsers(userIds: string[], event: string, payload?: Record<string, unknown>): void;
}

let current: Realtime = { toUsers() {} };
export const setRealtime = (r: Realtime) => {
  current = r;
};
export const realtime = (): Realtime => current;

export const room = (userId: string) => `user:${userId}`;

export function attachSocket(server: HttpServer, d: Deps): Realtime {
  const io = new Server(server, {
    path: '/socket.io',
    cors: { origin: d.env.CLIENT_URL.split(',').map((s) => s.trim()), credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const token = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : '';
      const clerkId = token ? await d.auth.verifyToken(token) : null;
      if (!clerkId) return next(new Error('unauthorized'));
      const user = await d.db.user.findUnique({ where: { clerkId }, select: { id: true, status: true } });
      if (!user || user.status !== 'ACTIVE') return next(new Error('unauthorized'));
      socket.data.userId = user.id;
      next();
    } catch (err) {
      logger.warn({ err }, 'socket auth failed');
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    void socket.join(room(socket.data.userId as string));
  });

  const rt: Realtime = {
    toUsers(userIds, event, payload = {}) {
      for (const id of new Set(userIds)) io.to(room(id)).emit(event, payload);
    },
  };
  setRealtime(rt);
  return rt;
}
