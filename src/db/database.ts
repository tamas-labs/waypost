import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';

import migrations from './migrations/migrations';
import * as schema from './schema';

export { schema };

/**
 * The local database: synchronous SQLite through Drizzle. In the app it is expo-sqlite (open.ts), in the tests
 * better-sqlite3 (testing.ts); code that reads or writes it takes this type.
 */
export type Database = BaseSQLiteDatabase<'sync', unknown, typeof schema>;

/** Applies the migrations that have not run yet (in one transaction); safe to call on every start. */
export async function migrateDatabase(db: Database): Promise<void> {
  // The Expo migrator only reads the bundled migrations and hands them to the dialect, which works with any
  // synchronous SQLite driver; the cast is needed for its parameter type only.
  await migrate(db as ExpoSQLiteDatabase<typeof schema>, migrations);
}
