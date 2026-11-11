import { z } from 'zod';

const csv = z
  .string()
  .default('')
  .transform((s) =>
    s
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean),
  );

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CLERK_PUBLISHABLE_KEY: z.string().min(1, 'CLERK_PUBLISHABLE_KEY is required'),
  CLERK_SECRET_KEY: z.string().min(1, 'CLERK_SECRET_KEY is required'),
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  SUPABASE_STORAGE_BUCKET: z.string().default('hospital-documents'),
  ADMIN_EMAILS: csv,
  OSM_CONTACT_EMAIL: z.string().default(''),
  OVERPASS_URLS: z
    .string()
    .default('https://overpass-api.de/api/interpreter,https://overpass.private.coffee/api/interpreter,https://overpass.kumi.systems/api/interpreter')
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)),
  NOMINATIM_URL: z.string().default('https://nominatim.openstreetmap.org'),
  /** ISO country codes the city search is limited to. Empty means worldwide. */
  GEO_COUNTRY_CODES: z.string().default('in'),
  /** Razorpay (optional). Without keys billing is switched off and every hospital has Pro features. */
  RAZORPAY_KEY_ID: z.string().default(''),
  RAZORPAY_KEY_SECRET: z.string().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(''),
  /** Prices in paise (₹1 = 100 paise). */
  PRO_MONTHLY_PAISE: z.coerce.number().int().min(100).default(99_900),
  PRO_YEARLY_PAISE: z.coerce.number().int().min(100).default(999_000),
  /** Optional. Without it the AI features report "unavailable" and everything else keeps working. */
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || 'env'}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}\nCopy server/.env.example to server/.env and fill it in.`);
  }
  return parsed.data;
}

export function userAgent(env: Env): string {
  const contact = env.OSM_CONTACT_EMAIL ? ` (${env.OSM_CONTACT_EMAIL})` : '';
  return `BloodBridge/1.0${contact}`;
}
