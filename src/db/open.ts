import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import { migrateDatabase, schema, type Database } from './database';

const DATABASE_NAME = 'waypost.db';

let database: Database | null = null;
let opening: Promise<Database> | null = null;

/** The app's database; opened, configured and migrated by openDatabase() at start. */
export function getDatabase(): Database {
  if (database === null) throw new Error('The database is not open yet: call openDatabase() first');
  return database;
}

/** Opens the database file and runs the pending migrations. Called once at start; later calls return the same database. */
export function openDatabase(): Promise<Database> {
  opening ??= (async () => {
    const client = openDatabaseSync(DATABASE_NAME);
    // WAL: readers do not block the writer; synchronous=FULL: a committed chain entry survives a power cut.
    client.execSync('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
    const db = drizzle(client, { schema });
    await migrateDatabase(db);
    database = db;
    return db;
  })();
  opening.catch(() => {
    opening = null;
  });
  return opening;
}
