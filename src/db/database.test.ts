import type { Checkpoint, Device, ReportSubscription, Route, RouteVersion, RouteVersionCheckpoint, Schedule, Site, User } from '@waypost/schema';
import { getTableName } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { migrateDatabase } from './database';
import { deleteKv, getKv, setKv } from './kv';
import * as schema from './schema';
import { createTestDatabase } from './testing';

// Compile-time: pulled entities are stored as they come (users without site_ids, which go to site_user).
const _entitiesFit: [
  (typeof schema.sites.$inferInsert)[],
  (typeof schema.users.$inferInsert)[],
  (typeof schema.devices.$inferInsert)[],
  (typeof schema.checkpoints.$inferInsert)[],
  (typeof schema.routes.$inferInsert)[],
  (typeof schema.routeVersions.$inferInsert)[],
  (typeof schema.routeVersionCheckpoints.$inferInsert)[],
  (typeof schema.schedules.$inferInsert)[],
  (typeof schema.reportSubscriptions.$inferInsert)[],
] = [[] as Site[], [] as Omit<User, 'site_ids'>[], [] as Device[], [] as Checkpoint[], [] as Route[], [] as RouteVersion[], [] as RouteVersionCheckpoint[], [] as Schedule[], [] as ReportSubscription[]];
void _entitiesFit;

const EXAMPLES = join(dirname(require.resolve('@waypost/schema/package.json')), 'examples', 'entities');

function validExamples(entity: string): Record<string, unknown>[] {
  const dir = join(EXAMPLES, entity, 'valid');
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(readFileSync(join(dir, file), 'utf8')) as Record<string, unknown>);
}

const ENTITY_TABLES: [string, SQLiteTable][] = [
  ['site', schema.sites],
  ['device', schema.devices],
  ['checkpoint', schema.checkpoints],
  ['route', schema.routes],
  ['route-version', schema.routeVersions],
  ['route-version-checkpoint', schema.routeVersionCheckpoints],
  ['schedule', schema.schedules],
  ['report-subscription', schema.reportSubscriptions],
];

describe('local database', () => {
  it('creates every table of the schema', async () => {
    const { sqlite } = await createTestDatabase();
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);
    const expected = Object.values(schema)
      .map((table) => getTableName(table))
      .sort();
    expect(tables).toEqual(expected);
    expect(tables).toEqual(expect.arrayContaining(['chain_entries', 'outbox', 'kv', 'site_user']));
  });

  it('runs the migrations only once', async () => {
    const { db, sqlite } = await createTestDatabase();
    setKv(db, 'sync.cursor', 'c1');
    await migrateDatabase(db);
    expect(getKv(db, 'sync.cursor')).toBe('c1');
    const applied = sqlite.prepare('SELECT COUNT(*) AS n FROM __drizzle_migrations').get() as { n: number };
    expect(applied.n).toBe(1);
  });

  it('has no e-mail or password for users, and no secret for devices', async () => {
    const { sqlite } = await createTestDatabase();
    const columns = (table: string) => sqlite.prepare(`PRAGMA table_info(${table})`).all().map((row) => (row as { name: string }).name);
    expect(columns('users')).not.toEqual(expect.arrayContaining(['email']));
    expect(columns('users')).not.toEqual(expect.arrayContaining(['password']));
    expect(columns('devices')).not.toEqual(expect.arrayContaining(['secret']));
    expect(columns('chain_entries')).toEqual(expect.arrayContaining(['synced_at']));
  });

  it.each(ENTITY_TABLES)('stores every valid %s example of @waypost/schema unchanged', async (entity, table) => {
    const { db } = await createTestDatabase();
    const examples = validExamples(entity);
    expect(examples.length).toBeGreaterThan(0);
    for (const example of examples) {
      db.delete(table).run();
      db.insert(table).values(example).run();
      expect(db.select().from(table).all()).toEqual([example]);
    }
  });

  it('stores every valid user example without site_ids', async () => {
    const { db } = await createTestDatabase();
    for (const { site_ids: _siteIds, ...user } of validExamples('user')) {
      db.delete(schema.users).run();
      db.insert(schema.users).values(user as typeof schema.users.$inferInsert).run();
      expect(db.select().from(schema.users).all()).toEqual([user]);
    }
  });

  it('keeps one chain per device: seq is unique per device', async () => {
    const { db } = await createTestDatabase();
    const entry = {
      id: '01900000-0000-7000-8000-000000000001',
      device_id: '01900000-0000-7000-8000-0000000000d1',
      seq: 1,
      type: 'shift_closed' as const,
      payload: { shift_id: '01900000-0000-7000-8000-0000000000a1', closed_by: 'guard' as const },
      device_time: '2026-10-27T21:00:00.000Z',
      uptime_ms: 1000,
      boot_id: 'android-boot:12',
      gnss_time: null,
      ref_server_time: null,
      ref_uptime_ms: null,
      ref_boot_id: null,
      prev_hash: '0'.repeat(64),
      hash: 'a'.repeat(64),
    };
    db.insert(schema.chainEntries).values(entry).run();
    expect(db.select().from(schema.chainEntries).get()).toEqual({ ...entry, synced_at: null });
    expect(() => db.insert(schema.chainEntries).values({ ...entry, id: '01900000-0000-7000-8000-000000000002' }).run()).toThrow(/UNIQUE/);
    db.insert(schema.chainEntries)
      .values({ ...entry, id: '01900000-0000-7000-8000-000000000003', device_id: '01900000-0000-7000-8000-0000000000d2' })
      .run();
  });
});

describe('kv', () => {
  it('stores, overwrites and deletes JSON values', async () => {
    const { db } = await createTestDatabase();
    expect(getKv(db, 'sync.time_ref')).toBeNull();
    const ref = { server_time: '2026-10-27T10:05:12.345Z', uptime_ms: 86_400_123, boot_id: 'android-boot:12' };
    setKv(db, 'sync.time_ref', ref);
    expect(getKv(db, 'sync.time_ref')).toEqual(ref);
    setKv(db, 'sync.time_ref', { ...ref, uptime_ms: 1 });
    expect(getKv(db, 'sync.time_ref')).toEqual({ ...ref, uptime_ms: 1 });
    deleteKv(db, 'sync.time_ref');
    expect(getKv(db, 'sync.time_ref')).toBeNull();
  });
});
