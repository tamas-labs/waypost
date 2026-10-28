// Test helper: an in-memory database with the app's migrations, on better-sqlite3 (Node). Only tests import it.
import BetterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import { migrateDatabase, schema, type Database } from './database';

export interface TestDatabase {
  db: Database;
  /** The underlying connection, for raw SQL in assertions. */
  sqlite: BetterSqlite3.Database;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const sqlite = new BetterSqlite3(':memory:');
  const db = drizzle(sqlite, { schema });
  await migrateDatabase(db);
  return { db, sqlite };
}
