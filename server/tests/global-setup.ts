import pg from 'pg';
import { schemaToSql } from './helpers/schema-sql.js';

export const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/bloodbridge_test';

/** Rebuilds the test schema from prisma/schema.prisma once per run. Needs a reachable, disposable Postgres. */
export default async function setup() {
  const client = new pg.Client({ connectionString: TEST_DB_URL });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(`Cannot reach the test database at ${TEST_DB_URL}. Start Postgres and set TEST_DATABASE_URL. (${(err as Error).message})`);
  }
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await client.query(schemaToSql());
  await client.end();
}
