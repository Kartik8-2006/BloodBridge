import 'dotenv/config';
import { createApp } from './app.js';
import { loadEnv, userAgent } from './config/env.js';
import { logger } from './lib/logger.js';
import { createPrisma } from './lib/prisma.js';
import { createClerkAuth } from './middleware/auth.js';
import { createGeocoder } from './services/nominatim.js';
import { createRazorpay } from './services/payments.js';
import { createGeminiClient } from './services/ai.js';
import { createOverpassClient } from './services/overpass.js';
import { attachSocket } from './services/realtime.js';
import { startJobs } from './services/jobs.js';
import { createSupabaseStorage } from './services/storage.js';

const env = loadEnv();
const db = createPrisma(env.DATABASE_URL);
const ua = userAgent(env);

const deps = {
  db,
  env,
  auth: createClerkAuth(env),
  storage: createSupabaseStorage(env),
  overpass: createOverpassClient({ urls: env.OVERPASS_URLS, userAgent: ua }),
  geocoder: createGeocoder({ baseUrl: env.NOMINATIM_URL, userAgent: ua, countryCodes: env.GEO_COUNTRY_CODES }),
  payments: createRazorpay({ keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET, webhookSecret: env.RAZORPAY_WEBHOOK_SECRET }),
  ai: createGeminiClient({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL }),
};
const app = createApp(deps);

const server = app.listen(env.PORT, () => logger.info(`BloodBridge API listening on :${env.PORT}`));
attachSocket(server, deps);
const stopJobs = startJobs(db);

const shutdown = (signal: string) => {
  logger.info(`${signal} received, shutting down`);
  stopJobs();
  server.close(async () => {
    await db.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
