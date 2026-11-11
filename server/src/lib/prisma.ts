import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export type Db = InstanceType<typeof PrismaClient>;

/**
 * Supabase poolers present a certificate chain Node does not trust by default, so for remote hosts we
 * keep TLS on but skip chain verification. `sslmode` / `pgbouncer` URL params are stripped because
 * node-postgres would let them override this setting.
 */
export function createPrisma(databaseUrl: string): Db {
  const url = new URL(databaseUrl);
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  url.searchParams.delete('sslmode');
  url.searchParams.delete('pgbouncer');
  const adapter = new PrismaPg({
    connectionString: url.toString(),
    ssl: local ? false : { rejectUnauthorized: false },
    max: 10,
  });
  return new PrismaClient({ adapter });
}
