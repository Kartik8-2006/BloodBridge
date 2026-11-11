import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { aiRouter } from './modules/ai.routes.js';
import { analyticsRouter } from './modules/analytics.routes.js';
import { campsRouter } from './modules/camps.routes.js';
import { exportsRouter } from './modules/exports.routes.js';
import { inventoryRouter } from './modules/inventory.routes.js';
import { billingRouter, billingWebhook } from './modules/billing.routes.js';
import { adminRouter } from './modules/admin.routes.js';
import { dashboardRouter } from './modules/dashboard.routes.js';
import { donorsRouter } from './modules/donors.routes.js';
import { geoRouter } from './modules/geo.routes.js';
import { hospitalsRouter } from './modules/hospitals.routes.js';
import { donationsRouter, requestsRouter, responsesRouter } from './modules/requests.routes.js';
import { notificationsRouter } from './modules/notifications.routes.js';
import { publicRouter } from './modules/public.routes.js';
import { usersRouter } from './modules/users.routes.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { loadUser } from './middleware/auth.js';
import { logger } from './lib/logger.js';
import type { Deps } from './deps.js';

export function createApp(d: Deps) {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors({ origin: d.env.CLIENT_URL.split(',').map((s) => s.trim()), credentials: true }));
  // Razorpay signs the raw body, so this route must see the bytes before the JSON parser does.
  app.post('/api/billing/webhook', ...billingWebhook(d));
  app.use(express.json({ limit: '100kb' }));
  if (d.env.NODE_ENV !== 'test') app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));
  app.use('/api', rateLimit({ windowMs: 15 * 60_000, limit: 600, standardHeaders: 'draft-7', legacyHeaders: false, skip: () => d.env.NODE_ENV === 'test' }));

  // Clerk session parsing runs for every request; routes decide whether a user is required.
  for (const handler of d.auth.handlers) app.use(handler);

  const authed = [loadUser(d.db, d.auth, d.env)];
  const geoLimit = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, skip: () => d.env.NODE_ENV === 'test' });

  app.use('/api', publicRouter(d));
  app.use('/api/geo', geoLimit, geoRouter(d));
  app.use('/api/hospitals', hospitalsRouter(d, authed));
  app.use('/api/users', ...authed, usersRouter(d));
  app.use('/api/donors', ...authed, donorsRouter(d));
  app.use('/api/public/subscribe', rateLimit({ windowMs: 60_000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false, skip: () => d.env.NODE_ENV === 'test' }));
  const handshakeLimit = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, skip: () => d.env.NODE_ENV === 'test' });
  app.use('/api/requests/:id/handshake', handshakeLimit);
  app.use('/api/requests', ...authed, requestsRouter(d));
  app.use('/api/responses', ...authed, responsesRouter(d));
  app.use('/api/donations', ...authed, donationsRouter(d));
  app.use('/api/notifications', ...authed, notificationsRouter(d));
  app.use('/api/dashboard', ...authed, dashboardRouter(d));
  app.use('/api/admin', ...authed, adminRouter(d));

  const aiLimit = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, skip: () => d.env.NODE_ENV === 'test' });
  app.use('/api/ai', aiLimit, aiRouter(d, authed));
  app.use('/api/inventory', ...authed, inventoryRouter(d));
  app.use('/api/exports', ...authed, exportsRouter(d));
  app.use('/api/camps', campsRouter(d, authed));
  app.use('/api/analytics', ...authed, analyticsRouter(d));
  app.use('/api/billing', ...authed, billingRouter(d));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
