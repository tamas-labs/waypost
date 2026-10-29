import type { SyncPullResponse } from '@waypost/schema';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { createApiClient } from '@/api/client';
import { ApiError, NetworkError } from '@/api/errors';
import type { Database } from '@/db/database';
import { getKv, setKv } from '@/db/kv';
import { rounds } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import type { ClockReading } from '@/time/clock';

import { onConfigurationPulled } from './events';
import { applyPullPages, pullConfiguration, type PullSummary } from './pull';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));

const EXAMPLES = join(dirname(require.resolve('@waypost/schema/package.json')), 'examples', 'api', 'sync-pull.response', 'valid');
const example = (name: string) => JSON.parse(readFileSync(join(EXAMPLES, `${name}.json`), 'utf8')) as SyncPullResponse;

const BASE_URL = 'https://waypost.example/api/waypost/v1';
const SITE = '019a2b3c-4d5e-7f00-8a00-000000000001';
const OTHER_SITE = '019a2b3c-4d5e-7f00-8a00-000000000012';
const GUARD = '019a2b3c-4d5e-7f00-8a00-000000000003';
const SUPERVISOR = '019a2b3c-4d5e-7f00-8a00-000000000002';
const CHECKPOINT = '019a2b3c-4d5e-7f00-8a00-000000000005';
const ROUTE = '019a2b3c-4d5e-7f00-8a00-000000000007';
const ROUTE_VERSION = '019a2b3c-4d5e-7f00-8a00-000000000008';
const SCHEDULE = '019a2b3c-4d5e-7f00-8a00-000000000009';
const STALE = '019a2b3c-4d5e-7f00-8a00-0000000000ff';

const SAVED_CURSOR = 'Y3Vyc29yLTA';
const CURSOR_1 = 'Y3Vyc29yLTE';
const CURSOR_2 = 'Y3Vyc29yLTI';

/** A page in which nothing changed, with the given fields. */
function page(fields: Partial<Omit<SyncPullResponse, 'changes' | 'deleted'>> & { changes?: Partial<SyncPullResponse['changes']>; deleted?: Partial<SyncPullResponse['deleted']> } = {}): SyncPullResponse {
  const empty = example('nothing-changed');
  return {
    ...empty,
    ...fields,
    changes: { ...empty.changes, ...fields.changes },
    deleted: { ...empty.deleted, ...fields.deleted },
  };
}

/** The API answering with the given responses in order (status 200 unless a [status, body] pair); validates them against the schema. */
function fakeApi(...responses: (SyncPullResponse | [number, unknown] | Error)[]) {
  const urls: string[] = [];
  const fetchMock = jest.fn(async (url: string | URL | Request) => {
    urls.push(String(url));
    const next = responses.shift();
    if (next === undefined) throw new Error('No more responses');
    if (next instanceof Error) throw next;
    const [status, body] = Array.isArray(next) ? next : [200, next];
    return new Response(JSON.stringify(body), { status });
  });
  return { api: createApiClient({ baseUrl: BASE_URL, fetch: fetchMock, validate: true }), urls, fetchMock };
}

/** Clock readings 1 s apart, one per response. */
function fakeClock() {
  let uptime = 1_000_000;
  return (): ClockReading => {
    uptime += 1000;
    return { device_time: '2026-10-27T10:05:13.000Z', uptime_ms: uptime, boot_id: 'android-boot:12' };
  };
}

const cursorOf = (url: string) => new URL(url).searchParams.get('cursor');

function names(sqlite: Awaited<ReturnType<typeof createTestDatabase>>['sqlite'], table: string): string[] {
  return sqlite
    .prepare(`SELECT name FROM ${table} ORDER BY name`)
    .all()
    .map((row) => (row as { name: string }).name);
}

function siteUserRows(sqlite: Awaited<ReturnType<typeof createTestDatabase>>['sqlite']) {
  return sqlite.prepare('SELECT site_id, user_id FROM site_user ORDER BY user_id, site_id').all();
}

async function fullyPulled() {
  const test = await createTestDatabase();
  const { api } = fakeApi(example('full-state'));
  await pullConfiguration(test.db, api, 'device-token', { readClock: fakeClock() });
  return test;
}

function insertRound(db: Database) {
  db.insert(rounds)
    .values({
      id: '019a2b3c-4d5e-7f00-8a00-0000000000a1',
      shift_id: '019a2b3c-4d5e-7f00-8a00-0000000000a2',
      route_version_id: ROUTE_VERSION,
      schedule_id: SCHEDULE,
      scheduled_at: '2026-10-27T19:00:00.000Z',
      time_limit_min: 20,
      status: 'open',
    })
    .run();
}

describe('pull', () => {
  let pulled: PullSummary[];
  let unsubscribe: () => void;
  beforeEach(() => {
    pulled = [];
    unsubscribe = onConfigurationPulled((summary) => pulled.push(summary));
  });
  afterEach(() => unsubscribe());

  it('pulls the full state without a cursor, and saves the cursor and the server time with its clock reading', async () => {
    const { db, sqlite } = await createTestDatabase();
    const { api, urls } = fakeApi(example('full-state'));

    const summary = await pullConfiguration(db, api, 'device-token', { readClock: fakeClock() });

    expect(urls).toEqual([`${BASE_URL}/sync/pull`]);
    expect(names(sqlite, 'sites')).toEqual(['Telephely A']);
    expect(names(sqlite, 'users')).toEqual(['Kiss Péter', 'Nagy Anna']);
    expect(siteUserRows(sqlite)).toEqual([
      { site_id: SITE, user_id: SUPERVISOR },
      { site_id: OTHER_SITE, user_id: SUPERVISOR },
      { site_id: SITE, user_id: GUARD },
    ]);
    expect(names(sqlite, 'checkpoints')).toEqual(['Kazánház', 'Raktár hátsó ajtó']);
    expect(sqlite.prepare('SELECT checkpoint_id, position FROM route_version_checkpoints ORDER BY position').all()).toHaveLength(2);
    expect(sqlite.prepare('SELECT active, mode, interval_from FROM schedules').get()).toEqual({ active: 1, mode: 'interval', interval_from: '20:00' });
    expect(names(sqlite, 'devices')).toEqual(['Portásfülke telefon']);
    expect(sqlite.prepare('SELECT frequency FROM report_subscriptions').all()).toEqual([{ frequency: 'weekly' }]);

    expect(getKv(db, 'sync.cursor')).toBe(example('full-state').cursor);
    expect(getKv(db, 'sync.time_ref')).toEqual({ server_time: example('full-state').server_time, uptime_ms: 1_001_000, boot_id: 'android-boot:12' });
    expect(summary).toMatchObject({ pages: 1, reset: true, changed: { users: 2, checkpoints: 2, route_version_checkpoints: 2 }, deleted: { users: 0 } });
    expect(pulled).toEqual([summary]);
  });

  it('replaces the local configuration on a reset, but keeps route versions and the data created on the device', async () => {
    const { db, sqlite } = await fullyPulled();
    insertRound(db);
    const staleSite = { ...example('full-state').changes.sites[0]!, id: STALE, name: 'Régi telephely' };
    const staleVersion = { ...example('full-state').changes.route_versions[0]!, id: STALE, version: 9 };
    const { api } = fakeApi(page({ cursor: CURSOR_1, reset: true, changes: { sites: [staleSite], route_versions: [staleVersion] } }));
    await pullConfiguration(db, api, 'device-token', { readClock: fakeClock() });

    const { api: again } = fakeApi(example('full-state'));
    await pullConfiguration(db, again, 'device-token', { readClock: fakeClock() });

    expect(names(sqlite, 'sites')).toEqual(['Telephely A']);
    expect(names(sqlite, 'users')).toEqual(['Kiss Péter', 'Nagy Anna']);
    expect(sqlite.prepare('SELECT version FROM route_versions ORDER BY version').all()).toEqual([{ version: 1 }, { version: 9 }]);
    expect(sqlite.prepare('SELECT status FROM rounds').all()).toEqual([{ status: 'open' }]);
  });

  it('pulls incrementally from the saved cursor: updates records and replaces the sites of a user', async () => {
    const { db, sqlite } = await fullyPulled();
    setKv(db, 'sync.cursor', SAVED_CURSOR);
    const full = example('full-state');
    const renamed = { ...full.changes.checkpoints[0]!, name: 'Raktár, hátsó ajtó', updated_at: '2026-10-27T11:00:00.000Z' };
    const moved = { ...full.changes.users[1]!, site_ids: [SITE], updated_at: '2026-10-27T11:00:00.000Z' };
    const { api, urls } = fakeApi(page({ server_time: '2026-10-27T11:00:05.000Z', cursor: CURSOR_1, changes: { checkpoints: [renamed], users: [moved] } }));

    const summary = await pullConfiguration(db, api, 'device-token', { readClock: fakeClock() });

    expect(urls.map(cursorOf)).toEqual([SAVED_CURSOR]);
    expect(names(sqlite, 'checkpoints')).toEqual(['Kazánház', 'Raktár, hátsó ajtó']);
    expect(siteUserRows(sqlite)).toEqual([
      { site_id: SITE, user_id: SUPERVISOR },
      { site_id: SITE, user_id: GUARD },
    ]);
    expect(getKv(db, 'sync.cursor')).toBe(CURSOR_1);
    expect(summary).toMatchObject({ reset: false, changed: { checkpoints: 1, users: 1, sites: 0 } });
  });

  it('requests the next page while has_more is true, and applies all of them', async () => {
    const { db, sqlite } = await createTestDatabase();
    const full = example('full-state');
    const first = page({ server_time: '2026-10-27T10:05:12.345Z', cursor: CURSOR_1, has_more: true, reset: true, changes: { sites: full.changes.sites, users: full.changes.users } });
    const second = page({ server_time: '2026-10-27T10:05:12.900Z', cursor: CURSOR_2, changes: { checkpoints: full.changes.checkpoints } });
    const { api, urls } = fakeApi(first, second);

    const summary = await pullConfiguration(db, api, 'device-token', { readClock: fakeClock() });

    expect(urls.map(cursorOf)).toEqual([null, CURSOR_1]);
    expect(names(sqlite, 'users')).toEqual(['Kiss Péter', 'Nagy Anna']);
    expect(names(sqlite, 'checkpoints')).toEqual(['Kazánház', 'Raktár hátsó ajtó']);
    expect(getKv(db, 'sync.cursor')).toBe(CURSOR_2);
    // The server time of the last page, with the clock read when it arrived.
    expect(getKv(db, 'sync.time_ref')).toEqual({ server_time: '2026-10-27T10:05:12.900Z', uptime_ms: 1_002_000, boot_id: 'android-boot:12' });
    expect(summary).toMatchObject({ pages: 2, reset: true, changed: { sites: 1, users: 2, checkpoints: 2 } });
  });

  it('deletes the records of the deleted lists, and the site assignments of deleted users', async () => {
    const { db, sqlite } = await fullyPulled();
    setKv(db, 'sync.cursor', SAVED_CURSOR);
    const { api } = fakeApi(page({ cursor: CURSOR_1, deleted: { users: [GUARD], checkpoints: [CHECKPOINT], schedules: [SCHEDULE], routes: [ROUTE] } }));

    const summary = await pullConfiguration(db, api, 'device-token', { readClock: fakeClock() });

    expect(names(sqlite, 'users')).toEqual(['Nagy Anna']);
    expect(siteUserRows(sqlite)).toEqual([
      { site_id: SITE, user_id: SUPERVISOR },
      { site_id: OTHER_SITE, user_id: SUPERVISOR },
    ]);
    expect(names(sqlite, 'checkpoints')).toEqual(['Kazánház']);
    expect(names(sqlite, 'routes')).toEqual([]);
    expect(names(sqlite, 'schedules')).toEqual([]);
    // Route versions are never deleted: a round in progress may still use one.
    expect(sqlite.prepare('SELECT id FROM route_versions').all()).toEqual([{ id: ROUTE_VERSION }]);
    expect(summary.deleted).toMatchObject({ users: 1, checkpoints: 1, schedules: 1, routes: 1 });
    expect(pulled).toHaveLength(2);
  });

  it('does not tell the other modules about a pull that changed nothing', async () => {
    const { db } = await fullyPulled();
    pulled = [];
    const { api } = fakeApi(page({ cursor: CURSOR_1 }));
    await pullConfiguration(db, api, 'device-token', { readClock: fakeClock() });
    expect(pulled).toEqual([]);
    expect(getKv(db, 'sync.cursor')).toBe(CURSOR_1);
  });

  it('applies nothing and keeps the cursor if a later page fails', async () => {
    const { db, sqlite } = await fullyPulled();
    setKv(db, 'sync.cursor', SAVED_CURSOR);
    const timeRef = getKv(db, 'sync.time_ref');
    const { api } = fakeApi(page({ cursor: CURSOR_1, has_more: true, deleted: { users: [GUARD] } }), new TypeError('Network request failed'));

    await expect(pullConfiguration(db, api, 'device-token', { readClock: fakeClock() })).rejects.toBeInstanceOf(NetworkError);

    expect(names(sqlite, 'users')).toEqual(['Kiss Péter', 'Nagy Anna']);
    expect(getKv(db, 'sync.cursor')).toBe(SAVED_CURSOR);
    expect(getKv(db, 'sync.time_ref')).toEqual(timeRef);
  });

  it('rolls the transaction back if a page cannot be applied', async () => {
    const { db, sqlite } = await fullyPulled();
    setKv(db, 'sync.cursor', SAVED_CURSOR);
    const clock = fakeClock()();
    const broken = { ...example('full-state').changes.sites[0]!, name: null } as unknown as SyncPullResponse['changes']['sites'][number];
    const pages = [
      { page: page({ cursor: CURSOR_1, has_more: true, reset: true }), clock },
      { page: page({ cursor: CURSOR_2, changes: { sites: [broken] } }), clock },
    ];

    expect(() => applyPullPages(db, pages)).toThrow();

    expect(names(sqlite, 'users')).toEqual(['Kiss Péter', 'Nagy Anna']);
    expect(getKv(db, 'sync.cursor')).toBe(SAVED_CURSOR);
  });

  it('starts over with the full state if the server rejects the cursor', async () => {
    const { db, sqlite } = await createTestDatabase();
    setKv(db, 'sync.cursor', 'dW5rbm93bg');
    const rejected = { error: { code: 'validation_failed', message: 'Hibás kurzor.', details: { cursor: ['Hibás kurzor.'] } } };
    const { api, urls } = fakeApi([422, rejected], example('full-state'));

    await pullConfiguration(db, api, 'device-token', { readClock: fakeClock() });

    expect(urls.map(cursorOf)).toEqual(['dW5rbm93bg', null]);
    expect(names(sqlite, 'sites')).toEqual(['Telephely A']);
  });

  it('passes on other errors without retrying', async () => {
    const { db } = await createTestDatabase();
    setKv(db, 'sync.cursor', SAVED_CURSOR);
    const { api, urls } = fakeApi([401, { error: { code: 'device_revoked', message: 'A telefont visszavonták.' } }]);
    const error = await pullConfiguration(db, api, 'device-token').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'device_revoked' });
    expect(urls).toHaveLength(1);
    expect(getKv(db, 'sync.cursor')).toBe(SAVED_CURSOR);
  });

  it('stops if has_more is true but the cursor does not move', async () => {
    const { db } = await createTestDatabase();
    setKv(db, 'sync.cursor', CURSOR_1);
    const { api } = fakeApi(page({ cursor: CURSOR_1, has_more: true }));
    await expect(pullConfiguration(db, api, 'device-token', { readClock: fakeClock() })).rejects.toThrow('the cursor did not move');
    expect(getKv(db, 'sync.cursor')).toBe(CURSOR_1);
  });
});
