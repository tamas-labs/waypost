import type { CheckpointResponse, RouteResponse, SyncPullResponse } from '@waypost/schema';
import { eq } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { configCalls } from '@/api/config-calls';
import { ApiError, NetworkError } from '@/api/errors';
import type { Database } from '@/db/database';
import { getKv, setKv } from '@/db/kv';
import { checkpoints, outbox, routes, siteUser, users } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import type { ClockReading } from '@/time/clock';

import {
  clearOutbox,
  dismissOutboxRejections,
  onOutboxQueued,
  OUTBOX_BACKOFF_MAX_MS,
  OUTBOX_BACKOFF_MIN_MS,
  outboxBackoffMs,
  outboxRejections,
  queueAction,
  resetOutboxBackoff,
  sendOutbox,
} from './outbox';
import { applyPullPages } from './pull';
import { useSyncStatus } from './status';
import { fakeApi, type FakeAnswer, type RecordedRequest } from './testing';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));

const EXAMPLES = join(dirname(require.resolve('@waypost/schema/package.json')), 'examples', 'api');
const example = <T>(endpoint: string, name: string) =>
  JSON.parse(readFileSync(join(EXAMPLES, endpoint, 'valid', `${name}.json`), 'utf8')) as T;

const SITE = '019a2b3c-4d5e-7f00-8a00-000000000001';
const SUPERVISOR = '019a2b3c-4d5e-7f00-8a00-000000000002';
const CHECKPOINT = '019a2b3c-4d5e-7f00-8a00-000000000005';
const ROUTE = '019a2b3c-4d5e-7f00-8a00-000000000007';
const NOW = Date.UTC(2026, 9, 27, 21, 0, 0);

const CHECKPOINT_RESPONSE = example<CheckpointResponse>('checkpoint.response', 'nfc');
const ROUTE_RESPONSE = example<RouteResponse>('route.response', 'fixed');
const DELETED = { server_time: '2026-10-27T21:00:00.000Z' };
const error = (status: number, code: string, message = 'Hiba.', details?: object): FakeAnswer => [
  status,
  { error: { code, message, ...(details === undefined ? {} : { details }) } },
];

const createCheckpoint = configCalls.createCheckpoint({
  id: CHECKPOINT,
  site_id: SITE,
  name: 'Hátsó ajtó',
  tag_type: 'nfc',
  tag_uid: '04A1B2C3D4E580',
});
const createRoute = configCalls.createRoute({ id: ROUTE, site_id: SITE, name: 'Éjszakai kör', order_mode: 'fixed' });

/** The local checkpoint as the supervisor action writes it before the call goes. */
const localCheckpoint = (tx: Database, name = 'Hátsó ajtó') =>
  tx
    .insert(checkpoints)
    .values({
      id: CHECKPOINT,
      site_id: SITE,
      name,
      tag_type: 'nfc',
      active: true,
      created_at: '2026-10-27T20:59:00.000Z',
      updated_at: '2026-10-27T20:59:00.000Z',
    })
    .onConflictDoUpdate({ target: checkpoints.id, set: { name } })
    .run();

let db: Database;
let now: number;
const clock = () => now;
const options = () => ({ now: clock, random: () => 0.5 });

beforeEach(async () => {
  ({ db } = await createTestDatabase());
  now = NOW;
  useSyncStatus.setState({ rejectedCalls: [] });
});

const rows = () => db.select().from(outbox).all();
const localName = () => db.select({ name: checkpoints.name }).from(checkpoints).where(eq(checkpoints.id, CHECKPOINT)).get()?.name;

/** Answers by path: a function of the request, or a queue per "METHOD path". */
function server(answers: Record<string, FakeAnswer[]>) {
  return fakeApi((request: RecordedRequest) => {
    const next = answers[`${request.method} ${request.path}`]?.shift();
    if (next === undefined) throw new Error(`Unexpected request: ${request.method} ${request.path}`);
    return next;
  });
}

describe('outboxBackoffMs', () => {
  it('starts at 5 s and doubles up to 10 minutes', () => {
    const delays = [1, 2, 3, 4, 5, 6, 7, 8, 9, 20].map((attempt) => outboxBackoffMs(attempt, () => 0.5));
    expect(delays).toEqual([5_000, 10_000, 20_000, 40_000, 80_000, 160_000, 320_000, 600_000, 600_000, 600_000]);
  });

  it('spreads the delay by ±20%, never below 5 s or above 10 minutes', () => {
    expect(outboxBackoffMs(3, () => 0)).toBe(16_000);
    expect(outboxBackoffMs(3, () => 1)).toBe(24_000);
    expect(outboxBackoffMs(1, () => 0)).toBe(OUTBOX_BACKOFF_MIN_MS);
    expect(outboxBackoffMs(1, () => 1)).toBe(6_000);
    expect(outboxBackoffMs(8, () => 0)).toBe(480_000);
    expect(outboxBackoffMs(8, () => 1)).toBe(OUTBOX_BACKOFF_MAX_MS);
  });
});

describe('queueAction', () => {
  it('changes the local database and queues the calls in one transaction, then tells the listeners', () => {
    const listener = jest.fn();
    const unsubscribe = onOutboxQueued(listener);
    const ids = queueAction(db, { apply: (tx) => localCheckpoint(tx), calls: [createCheckpoint, createRoute] }, SUPERVISOR);
    unsubscribe();

    expect(localName()).toBe('Hátsó ajtó');
    expect(rows()).toEqual([
      expect.objectContaining({
        id: ids[0],
        method: 'POST',
        path: '/checkpoints',
        body: { id: CHECKPOINT, site_id: SITE, name: 'Hátsó ajtó', tag_type: 'nfc', tag_uid: '04A1B2C3D4E580' },
        body_schema: 'api/checkpoint-create.request',
        response_schema: 'api/checkpoint.response',
        record_ids: [CHECKPOINT],
        acting_user_id: SUPERVISOR,
        attempts: 0,
        next_attempt_at: null,
      }),
      expect.objectContaining({ id: ids[1], path: '/routes', record_ids: [ROUTE] }),
    ]);
    expect(rows()[0]!.idempotency_key).not.toBe(rows()[1]!.idempotency_key);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('neither changes nor queues anything if the local change fails', () => {
    const fail = () =>
      queueAction(
        db,
        {
          apply: (tx) => {
            localCheckpoint(tx);
            throw new Error('Invalid action');
          },
          calls: [createCheckpoint],
        },
        null,
      );
    expect(fail).toThrow('Invalid action');
    expect(localName()).toBeUndefined();
    expect(rows()).toEqual([]);
  });
});

describe('sendOutbox', () => {
  it('sends the calls in the order they were queued, with their key, token and acting supervisor, and stores the responses', async () => {
    queueAction(db, { apply: (tx) => localCheckpoint(tx), calls: [createCheckpoint] }, SUPERVISOR);
    queueAction(db, { calls: [createRoute] }, SUPERVISOR);
    const [first, second] = rows();
    // A repeated create is answered with 200 (M5-02), a new one with 201: both are done.
    const { api, requests } = server({ 'POST /checkpoints': [[201, CHECKPOINT_RESPONSE]], 'POST /routes': [[200, ROUTE_RESPONSE]] });

    await sendOutbox({ db, api, token: 'device-token' }, options());

    expect(requests.map((request) => `${request.method} ${request.path}`)).toEqual(['POST /checkpoints', 'POST /routes']);
    expect(requests[0]!.headers).toMatchObject({
      Authorization: 'Bearer device-token',
      'Idempotency-Key': first!.idempotency_key,
      'X-Acting-User': SUPERVISOR,
    });
    expect(requests[1]!.headers['Idempotency-Key']).toBe(second!.idempotency_key);
    expect(requests[0]!.body).toEqual(first!.body);
    expect(rows()).toEqual([]);
    // The server's record replaces the local one, with what only the server knew.
    expect(db.select().from(checkpoints).get()).toMatchObject({ name: 'Raktár hátsó ajtó', tag_uid: '04A1B2C3D4E580' });
    expect(db.select().from(routes).get()).toMatchObject({ id: ROUTE, current_version_id: ROUTE_RESPONSE.route.current_version_id });
  });

  it('sends without X-Acting-User with a supervisor token', async () => {
    queueAction(db, { calls: [configCalls.deleteCheckpoint(CHECKPOINT)] }, null);
    const { api, requests } = server({ [`DELETE /checkpoints/${CHECKPOINT}`]: [DELETED] });

    await sendOutbox({ db, api, token: 'supervisor-token' }, options());

    expect(requests[0]!.headers).not.toHaveProperty('X-Acting-User');
    expect(requests[0]!.headers.Authorization).toBe('Bearer supervisor-token');
    expect(rows()).toEqual([]);
  });

  it.each([
    ['a network error', new NetworkError(false), NetworkError],
    ['a server error', error(500, 'server_error'), ApiError],
    ['a 503 without the error format', [503, 'Service Unavailable'] as FakeAnswer, ApiError],
  ])('retries after %s with backoff, keeping the key, and the calls after it wait', async (_name, failure, errorClass) => {
    queueAction(db, { calls: [createCheckpoint, createRoute] }, SUPERVISOR);
    const key = rows()[0]!.idempotency_key;
    const { api, requests } = server({
      'POST /checkpoints': [failure, failure, [201, CHECKPOINT_RESPONSE]],
      'POST /routes': [[201, ROUTE_RESPONSE]],
    });
    const send = () => sendOutbox({ db, api, token: 't' }, options());

    await expect(send()).rejects.toBeInstanceOf(errorClass);
    expect(rows()[0]).toMatchObject({ attempts: 1, next_attempt_at: '2026-10-27T21:00:05.000Z' });
    expect(rows()[0]!.last_error).toEqual(expect.any(String));

    // Not due yet: nothing is sent, and that is not an error.
    now += 4_999;
    await send();
    expect(requests).toHaveLength(1);

    now += 1;
    await expect(send()).rejects.toBeInstanceOf(errorClass);
    expect(rows()[0]).toMatchObject({ attempts: 2, next_attempt_at: '2026-10-27T21:00:15.000Z' });

    now += 10_000;
    await send();
    expect(requests.map((request) => request.path)).toEqual(['/checkpoints', '/checkpoints', '/checkpoints', '/routes']);
    expect(new Set(requests.slice(0, 3).map((request) => request.headers['Idempotency-Key']))).toEqual(new Set([key]));
    expect(rows()).toEqual([]);
  });

  it.each([
    [422, 'validation_failed', { name: ['A név kötelező.'] }],
    [409, 'conflict', { tag_uid: ['Ez a címke már egy másik ponthoz tartozik.'] }],
    [403, 'forbidden', undefined],
    [404, 'not_found', undefined],
  ])('drops a call refused with %i, tells the supervisor, makes the next pull a full one, and goes on', async (status, code, details) => {
    setKv(db, 'sync.cursor', 'Y3Vyc29yLTE');
    queueAction(db, { apply: (tx) => localCheckpoint(tx), calls: [createCheckpoint] }, SUPERVISOR);
    queueAction(db, { calls: [createRoute] }, SUPERVISOR);
    const callId = rows()[0]!.id;
    const { api, requests } = server({
      'POST /checkpoints': [error(status, code, 'Nem sikerült.', details)],
      'POST /routes': [[201, ROUTE_RESPONSE]],
    });

    await sendOutbox({ db, api, token: 't' }, options());

    expect(requests.map((request) => request.path)).toEqual(['/checkpoints', '/routes']);
    expect(rows()).toEqual([]);
    const rejection = {
      call_id: callId,
      method: 'POST',
      path: '/checkpoints',
      status,
      code,
      message: 'Nem sikerült.',
      details: details ?? null,
      at: '2026-10-27T21:00:00.000Z',
    };
    expect(outboxRejections(db)).toEqual([rejection]);
    expect(useSyncStatus.getState().rejectedCalls).toEqual([rejection]);
    expect(getKv(db, 'sync.cursor')).toBeNull();
    // Until the full pull, the local change stays.
    expect(localName()).toBe('Hátsó ajtó');

    dismissOutboxRejections(db);
    expect(outboxRejections(db)).toEqual([]);
    expect(useSyncStatus.getState().rejectedCalls).toEqual([]);
  });

  it('keeps a call on 401 as it is and stops', async () => {
    queueAction(db, { calls: [createCheckpoint, createRoute] }, SUPERVISOR);
    const { api, requests } = server({ 'POST /checkpoints': [error(401, 'device_revoked')] });

    await expect(sendOutbox({ db, api, token: 't' }, options())).rejects.toMatchObject({ status: 401, code: 'device_revoked' });

    expect(requests).toHaveLength(1);
    expect(rows()).toHaveLength(2);
    expect(rows()[0]).toMatchObject({ attempts: 0, next_attempt_at: null, last_error: null });
    expect(outboxRejections(db)).toEqual([]);
  });

  it('waits as long as Retry-After tells on 429, and without it with backoff', async () => {
    queueAction(db, { calls: [createCheckpoint] }, SUPERVISOR);
    const { api } = server({
      'POST /checkpoints': [
        [429, { error: { code: 'rate_limited', message: 'Túl sok kérés.' } }, { 'Retry-After': '30' }],
        error(429, 'rate_limited'),
      ],
    });
    const send = () => sendOutbox({ db, api, token: 't' }, options());

    await expect(send()).rejects.toMatchObject({ code: 'rate_limited' });
    expect(rows()[0]).toMatchObject({ attempts: 1, next_attempt_at: '2026-10-27T21:00:30.000Z' });

    now += 30_000;
    await expect(send()).rejects.toMatchObject({ code: 'rate_limited' });
    expect(rows()[0]).toMatchObject({ attempts: 2, next_attempt_at: '2026-10-27T21:00:40.000Z' });
    expect(outboxRejections(db)).toEqual([]);
  });

  it('retries a call that is still running on the server (409 with Retry-After) without an error', async () => {
    queueAction(db, { calls: [createCheckpoint] }, SUPERVISOR);
    const busy: FakeAnswer = [
      409,
      { error: { code: 'conflict', message: 'Ugyanez a kérés még feldolgozás alatt van, próbáld újra később.' } },
      { 'Retry-After': '5' },
    ];
    const { api, requests } = server({ 'POST /checkpoints': [busy, [200, CHECKPOINT_RESPONSE]] });
    const send = () => sendOutbox({ db, api, token: 't' }, options());

    await send();
    expect(rows()[0]).toMatchObject({ attempts: 1, next_attempt_at: '2026-10-27T21:00:05.000Z' });
    expect(outboxRejections(db)).toEqual([]);

    now += 5_000;
    await send();
    expect(requests).toHaveLength(2);
    expect(rows()).toEqual([]);
  });

  it('sends at once after resetOutboxBackoff, and when the clock has stepped back further than any backoff', async () => {
    queueAction(db, { calls: [createCheckpoint] }, SUPERVISOR);
    const { api, requests } = server({
      'POST /checkpoints': [new NetworkError(true), new NetworkError(false), [201, CHECKPOINT_RESPONSE]],
    });
    const send = () => sendOutbox({ db, api, token: 't' }, options());

    await expect(send()).rejects.toBeInstanceOf(NetworkError);
    resetOutboxBackoff(db);
    await expect(send()).rejects.toBeInstanceOf(NetworkError);
    expect(rows()[0]).toMatchObject({ attempts: 2, next_attempt_at: '2026-10-27T21:00:10.000Z' });

    now -= OUTBOX_BACKOFF_MAX_MS;
    await send();
    expect(requests).toHaveLength(3);
    expect(rows()).toEqual([]);
  });

  it('keeps the local record while another call for it still waits, and stores the response of the last one', async () => {
    queueAction(db, { apply: (tx) => localCheckpoint(tx), calls: [createCheckpoint] }, SUPERVISOR);
    queueAction(
      db,
      { apply: (tx) => localCheckpoint(tx, 'Főkapu'), calls: [configCalls.updateCheckpoint(CHECKPOINT, { name: 'Főkapu' })] },
      SUPERVISOR,
    );
    const renamed = { ...CHECKPOINT_RESPONSE, checkpoint: { ...CHECKPOINT_RESPONSE.checkpoint, name: 'Főkapu' } };
    const { api } = server({
      'POST /checkpoints': [[201, CHECKPOINT_RESPONSE]],
      [`PATCH /checkpoints/${CHECKPOINT}`]: [new NetworkError(false), renamed],
    });

    await expect(sendOutbox({ db, api, token: 't' }, options())).rejects.toBeInstanceOf(NetworkError);
    expect(localName()).toBe('Főkapu');

    now += 5_000;
    await sendOutbox({ db, api, token: 't' }, options());
    expect(db.select().from(checkpoints).get()).toMatchObject({ name: 'Főkapu', tag_uid: '04A1B2C3D4E580' });
  });

  it('drops a call whose 2xx response does not match its schema, makes the next pull a full one, and stops', async () => {
    setKv(db, 'sync.cursor', 'Y3Vyc29yLTE');
    queueAction(db, { calls: [createCheckpoint, createRoute] }, SUPERVISOR);
    const { api, requests } = server({ 'POST /checkpoints': [[201, { server_time: DELETED.server_time }]] });

    await expect(sendOutbox({ db, api, token: 't' }, options())).rejects.toMatchObject({ name: 'InvalidResponseError' });

    expect(requests).toHaveLength(1);
    expect(rows().map((row) => row.path)).toEqual(['/routes']);
    expect(getKv(db, 'sync.cursor')).toBeNull();
  });

  it('clears the calls and the refusals', () => {
    queueAction(db, { calls: [createCheckpoint] }, SUPERVISOR);
    setKv(db, 'outbox.rejected', []);
    clearOutbox(db);
    expect(rows()).toEqual([]);
    expect(getKv(db, 'outbox.rejected')).toBeNull();
  });
});

describe('the pull with calls waiting', () => {
  const PULL = example<SyncPullResponse>('sync-pull.response', 'full-state');
  const clockReading: ClockReading = { device_time: '2026-10-27T21:00:00.000Z', uptime_ms: 5_000_000, boot_id: 'android-boot:12' };
  const pulled = (page: SyncPullResponse) => applyPullPages(db, [{ page, clock: clockReading }]);
  const serverCheckpoint = PULL.changes.checkpoints.find((checkpoint) => checkpoint.id === CHECKPOINT)!;
  const siteIdsOf = (userId: string) =>
    db
      .select({ site_id: siteUser.site_id })
      .from(siteUser)
      .where(eq(siteUser.user_id, userId))
      .all()
      .map((row) => row.site_id);

  it('keeps the local state of a record a waiting call changes, at a full state too', () => {
    queueAction(
      db,
      { apply: (tx) => localCheckpoint(tx, 'Főkapu'), calls: [configCalls.updateCheckpoint(CHECKPOINT, { name: 'Főkapu' })] },
      null,
    );

    pulled({ ...PULL, reset: true });
    expect(localName()).toBe('Főkapu');
    pulled({
      ...PULL,
      changes: { ...PULL.changes, checkpoints: [serverCheckpoint] },
      deleted: { ...PULL.deleted, checkpoints: [CHECKPOINT] },
    });
    expect(localName()).toBe('Főkapu');

    db.delete(outbox).run();
    pulled({ ...PULL, reset: true });
    expect(localName()).toBe(serverCheckpoint.name);
  });

  it('keeps a user a waiting call changes with their sites, at a full state without them too', () => {
    const user = PULL.changes.users[0]!;
    pulled(PULL);
    queueAction(db, { calls: [configCalls.updateUser(user.id, { name: 'Nagy Péter' })] }, null);

    pulled({ ...PULL, reset: true, changes: { ...PULL.changes, users: [] } });

    expect(db.select({ id: users.id }).from(users).all()).toEqual([{ id: user.id }]);
    expect(siteIdsOf(user.id)).toEqual(user.site_ids);
  });

  it('keeps a record created locally through a full state until its call has gone', () => {
    const NEW = '019a2b3c-4d5e-7f00-8a00-0000000000aa';
    queueAction(
      db,
      {
        apply: (tx) =>
          tx
            .insert(routes)
            .values({
              id: NEW,
              site_id: SITE,
              name: 'Új kör',
              order_mode: 'free',
              active: true,
              created_at: PULL.server_time,
              updated_at: PULL.server_time,
            })
            .run(),
        calls: [configCalls.createRoute({ id: NEW, site_id: SITE, name: 'Új kör', order_mode: 'free' })],
      },
      null,
    );

    pulled({ ...PULL, reset: true });
    expect(
      db
        .select({ id: routes.id })
        .from(routes)
        .all()
        .map((row) => row.id),
    ).toContain(NEW);

    db.delete(outbox).run();
    pulled({ ...PULL, reset: true });
    expect(
      db
        .select({ id: routes.id })
        .from(routes)
        .all()
        .map((row) => row.id),
    ).not.toContain(NEW);
  });
});
