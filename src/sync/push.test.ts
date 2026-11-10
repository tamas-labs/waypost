import type { ChainEntry, SyncPushRequest, SyncPushResponse } from '@waypost/schema';
import { chainVectors } from '@waypost/schema/vectors';
import { asc } from 'drizzle-orm';

import { push } from '@/api/endpoints';
import { appendChainEntries } from '@/chain/writer';
import { shiftStarted } from '@/chain/payloads';
import type { Database } from '@/db/database';
import { getKv, setKv } from '@/db/kv';
import { chainEntries } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { uuidv7 } from '@/id/uuidv7';
import type { ClockReading } from '@/time/clock';

import { fakeApi, type FakeAnswer } from './testing';
import { firstInvalidEntry, PUSH_BATCH_SIZE, pushChainEntries, sendPendingDiagnostic } from './push';
import { ApiError } from '@/api/errors';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));

const DEVICE = '019a2b3c-4d5e-7f00-8a00-000000000004';
const SITE = '019a2b3c-4d5e-7f00-8a00-000000000001';
const GUARD = '019a2b3c-4d5e-7f00-8a00-000000000003';
const SERVER_TIME = '2026-10-27T21:00:00.000Z';

let db: Database;
let clockMs = Date.UTC(2026, 9, 27, 20);
const readClock = (): ClockReading => {
  clockMs += 1000;
  return { device_time: new Date(clockMs).toISOString(), uptime_ms: clockMs - Date.UTC(2026, 9, 27), boot_id: 'android-17' };
};

/** Writes n signed entries with the real chain writer, and returns them. */
function writeEntries(n: number): Promise<ChainEntry[]> {
  const drafts = Array.from({ length: n }, () => shiftStarted({ shift_id: uuidv7(), guard_id: GUARD, site_id: SITE }));
  return appendChainEntries(db, drafts, { readClock, readSecret: async () => chainVectors.key_base64 });
}

const answer = (fields: Partial<SyncPushResponse>): SyncPushResponse => ({
  server_time: SERVER_TIME,
  accepted: [],
  last_seq: 0,
  rejected: [],
  media_missing: [],
  ...fields,
});

/** The server accepting everything it gets, as the real one does for a good chain. */
const acceptAll = (body: unknown): SyncPushResponse => {
  const { entries } = body as SyncPushRequest;
  return answer({ accepted: entries.map((entry) => entry.id), last_seq: entries.at(-1)!.seq });
};

function run(respond: (body: unknown) => FakeAnswer, { validate = true }: { validate?: boolean } = {}) {
  const { api, requests } = fakeApi((request) => respond(request.body), { validate });
  const mediaMissing = new Set<string>();
  const done = pushChainEntries({ db, deviceId: DEVICE, mediaMissing }, (entries) =>
    push(api, 'device-token', { device_id: DEVICE, entries }),
  );
  return { done, requests, mediaMissing };
}

const synced = () =>
  db.select({ seq: chainEntries.seq, synced_at: chainEntries.synced_at }).from(chainEntries).orderBy(asc(chainEntries.seq)).all();
const sentSeqs = (body: unknown) => (body as SyncPushRequest).entries.map((entry) => entry.seq);

beforeEach(async () => {
  ({ db } = await createTestDatabase());
  setKv(db, 'device.id', DEVICE);
});

describe('push', () => {
  it('does not call the server when nothing waits', async () => {
    const { done, requests } = run(acceptAll);
    await done;
    expect(requests).toHaveLength(0);
  });

  it('sends the entries as they were signed, without the local column, and acknowledges them with the server time', async () => {
    const written = await writeEntries(2);
    const { done, requests } = run(acceptAll);
    await done;

    expect(requests.map((request) => [request.method, request.path])).toEqual([['POST', '/sync/push']]);
    expect(requests[0]!.headers['Idempotency-Key']).toEqual(expect.any(String));
    expect(requests[0]!.headers.Authorization).toBe('Bearer device-token');
    expect(requests[0]!.body).toEqual({ device_id: DEVICE, entries: written });
    expect(synced()).toEqual([
      { seq: 1, synced_at: SERVER_TIME },
      { seq: 2, synced_at: SERVER_TIME },
    ]);
  });

  it('sends only what is not acknowledged', async () => {
    await writeEntries(1);
    await run(acceptAll).done;
    await writeEntries(2);
    const { done, requests } = run(acceptAll);
    await done;
    expect(requests.map((request) => sentSeqs(request.body))).toEqual([[2, 3]]);
  });

  it('sends more than a batch in seq order, 200 at a time', async () => {
    await writeEntries(2 * PUSH_BATCH_SIZE + 5);
    const { done, requests } = run(acceptAll);
    await done;

    const batches = requests.map((request) => sentSeqs(request.body));
    expect(batches.map((batch) => batch.length)).toEqual([PUSH_BATCH_SIZE, PUSH_BATCH_SIZE, 5]);
    expect(batches.flat()).toEqual(Array.from({ length: 2 * PUSH_BATCH_SIZE + 5 }, (_, i) => i + 1));
    expect(synced().every((row) => row.synced_at === SERVER_TIME)).toBe(true);
  });

  it('counts an entry sent again as acknowledged (a response lost on the way)', async () => {
    const [entry] = await writeEntries(1);
    const lost = run(() => new TypeError('Network request failed'));
    await expect(lost.done).rejects.toThrow('Network request failed');
    expect(synced()).toEqual([{ seq: 1, synced_at: null }]);

    // The server has it already: it accepts it again.
    await run(() => answer({ accepted: [entry!.id], last_seq: 1 })).done;
    expect(synced()).toEqual([{ seq: 1, synced_at: SERVER_TIME }]);
  });

  it('keeps the acknowledgement of the first batch when the second one fails', async () => {
    await writeEntries(PUSH_BATCH_SIZE + 1);
    let calls = 0;
    const { done } = run((body) => {
      calls += 1;
      return calls === 1 ? acceptAll(body) : [503, { error: { code: 'server_error', message: 'Karbantartás' } }];
    });
    await expect(done).rejects.toMatchObject({ code: 'server_error' });
    expect(synced().filter((row) => row.synced_at !== null)).toHaveLength(PUSH_BATCH_SIZE);
  });

  describe('a batch refused as a whole (validation_failed)', () => {
    /** The server's 422 for an entry of the batch that is not valid against its schema. */
    const invalidAt = (...indexes: number[]): FakeAnswer => [
      422,
      {
        error: {
          code: 'validation_failed',
          message: 'A megadott adatok hibásak.',
          details: Object.fromEntries(indexes.map((index) => [`entries.${index}.payload.round_id`, ['Kötelező mező.']])),
        },
      },
    ];

    it('sends the entries before the invalid one, then fails, and keeps the invalid one for the next sync', async () => {
      await writeEntries(5);
      // Invalid as long as it is in the batch: the third and the fifth entry.
      const { done, requests } = run((body) => {
        const seqs = sentSeqs(body);
        const invalid = [3, 5].filter((seq) => seqs.includes(seq)).map((seq) => seqs.indexOf(seq));
        return invalid.length > 0 ? invalidAt(...invalid) : acceptAll(body);
      });
      await expect(done).rejects.toMatchObject({ status: 422, code: 'validation_failed' });
      expect(requests.map((request) => sentSeqs(request.body))).toEqual([
        [1, 2, 3, 4, 5],
        [1, 2],
      ]);
      expect(synced().map((row) => row.synced_at !== null)).toEqual([true, true, false, false, false]);
      expect(getKv(db, 'sync.rejected_through_seq')).toBeNull();
      expect(getKv(db, 'sync.pending_diagnostic')).toBeNull();

      // The next sync: the invalid entry is first, nothing goes up, with one request.
      const next = run(() => invalidAt(0, 2));
      await expect(next.done).rejects.toMatchObject({ code: 'validation_failed' });
      expect(next.requests.map((request) => sentSeqs(request.body))).toEqual([[3, 4, 5]]);

      // Once the server takes it (a fix there), everything goes up.
      await run(acceptAll).done;
      expect(synced().every((row) => row.synced_at !== null)).toBe(true);
    });

    it('fails with the error of the shorter batch if that fails too', async () => {
      await writeEntries(3);
      const responses: FakeAnswer[] = [invalidAt(2), [503, { error: { code: 'server_error', message: 'Karbantartás' } }]];
      const { done, requests } = run(() => responses.shift()!);
      await expect(done).rejects.toMatchObject({ code: 'server_error' });
      expect(requests.map((request) => sentSeqs(request.body))).toEqual([
        [1, 2, 3],
        [1, 2],
      ]);
      expect(synced().every((row) => row.synced_at === null)).toBe(true);
    });

    it('fails without sending anything else if the refusal names no entry', async () => {
      await writeEntries(2);
      const { done, requests } = run(() => [
        422,
        { error: { code: 'validation_failed', message: 'Hibás', details: { device_id: ['Nem ennek a telefonnak az azonosítója.'] } } },
      ]);
      await expect(done).rejects.toMatchObject({ code: 'validation_failed' });
      expect(requests).toHaveLength(1);
      expect(synced().every((row) => row.synced_at === null)).toBe(true);
    });

    it('reads the first entry from the details', () => {
      const refusal = (
        details: Record<string, [string, ...string[]]> | null,
        code: 'validation_failed' | 'forbidden' = 'validation_failed',
      ) => new ApiError(422, code, 'Hibás', details);
      expect(firstInvalidEntry(refusal({ 'entries.12.payload.x': ['a'], 'entries.3': ['b'], 'entries.7.seq': ['c'] }))).toBe(3);
      expect(firstInvalidEntry(refusal({ 'entries.0.hash': ['a'] }))).toBe(0);
      expect(firstInvalidEntry(refusal({ entries: ['a'], 'entries.x.y': ['b'], '': ['c'] }))).toBeNull();
      expect(firstInvalidEntry(refusal(null))).toBeNull();
      expect(firstInvalidEntry(refusal({ 'entries.1.seq': ['a'] }, 'forbidden'))).toBeNull();
      expect(firstInvalidEntry(new Error('entries.1'))).toBeNull();
    });
  });

  it('goes on after a truncated accepted list: the entries left get their acknowledgement when sent again', async () => {
    const entries = await writeEntries(3);
    const responses = [
      answer({ accepted: [entries[0]!.id, entries[1]!.id], last_seq: 3 }),
      answer({ accepted: [entries[2]!.id], last_seq: 3 }),
    ];
    const { done, requests } = run(() => responses.shift()!);
    await done;
    expect(requests.map((request) => sentSeqs(request.body))).toEqual([[1, 2, 3], [3]]);
    expect(synced().every((row) => row.synced_at !== null)).toBe(true);
  });

  it('stops when an answer does not move anything, instead of asking for ever', async () => {
    await writeEntries(1);
    const { done, requests } = run(() => answer({}));
    await done;
    expect(requests).toHaveLength(1);
    expect(synced()).toEqual([{ seq: 1, synced_at: null }]);
  });

  it('collects the photos the server asks for', async () => {
    await writeEntries(1);
    const photo = '019a2b3c-4d5e-7f00-8a00-000000000099';
    const { done, mediaMissing } = run((body) => ({ ...acceptAll(body), media_missing: [photo] }));
    await done;
    expect([...mediaMissing]).toEqual([photo]);
  });

  it('acknowledges what was accepted and leaves the rest at a partial rejection', async () => {
    const entries = await writeEntries(4);
    const { done } = run(() =>
      answer({
        accepted: [entries[0]!.id],
        last_seq: 1,
        rejected: [
          { id: entries[1]!.id, code: 'chain_fork', expected_seq: null },
          { id: entries[2]!.id, code: 'chain_gap', expected_seq: 2 },
          { id: entries[3]!.id, code: 'chain_gap', expected_seq: 2 },
        ],
      }),
    );
    await done;
    expect(synced()).toEqual([
      { seq: 1, synced_at: SERVER_TIME },
      { seq: 2, synced_at: null },
      { seq: 3, synced_at: null },
      { seq: 4, synced_at: null },
    ]);
    expect(getKv(db, 'sync.pending_diagnostic')).toEqual({
      id: expect.any(String),
      device_id: DEVICE,
      code: 'chain_fork',
      entry_id: entries[1]!.id,
      seq: 2,
      expected_seq: null,
      server_last_seq: 1,
      rejected_count: 3,
      occurred_at: SERVER_TIME,
    });
  });

  it.each([
    ['chain_gap', 5],
    ['chain_fork', null],
    ['bad_hmac', null],
  ] as const)('does not send a %s entry again, and the entries after it still go up', async (code, expected_seq) => {
    const [entry] = await writeEntries(1);
    await run(() => answer({ rejected: [{ id: entry!.id, code, expected_seq }] })).done;
    expect(getKv(db, 'sync.rejected_through_seq')).toBe(1);
    expect(getKv(db, 'sync.pending_diagnostic')).toMatchObject({ code, seq: 1, expected_seq, rejected_count: 1 });

    const again = run(acceptAll);
    await again.done;
    expect(again.requests).toHaveLength(0);

    const [next] = await writeEntries(1);
    const later = run(() => answer({ rejected: [{ id: next!.id, code: 'chain_gap', expected_seq: 1 }] }));
    await later.done;
    expect(later.requests.map((request) => sentSeqs(request.body))).toEqual([[2]]);
    // Only the first rejection of the chain is reported: the rest is its consequence.
    expect(getKv(db, 'sync.pending_diagnostic')).toMatchObject({ code, seq: 1 });
    expect(getKv(db, 'sync.rejected_through_seq')).toBe(2);
  });

  it('handles a rejection code a newer server added as any other rejection, in a release build', async () => {
    const entries = await writeEntries(2);
    const future = { id: entries[1]!.id, code: 'future_code', expected_seq: null } as unknown as SyncPushResponse['rejected'][number];
    const { done } = run(() => answer({ accepted: [entries[0]!.id], last_seq: 1, rejected: [future] }), { validate: false });
    await done;

    expect(synced()).toEqual([
      { seq: 1, synced_at: SERVER_TIME },
      { seq: 2, synced_at: null },
    ]);
    expect(getKv(db, 'sync.rejected_through_seq')).toBe(2);
    expect(getKv(db, 'sync.pending_diagnostic')).toMatchObject({ code: 'future_code', seq: 2, expected_seq: null });

    const [next] = await writeEntries(1);
    const later = run(acceptAll, { validate: false });
    await later.done;
    expect(later.requests.map((request) => sentSeqs(request.body))).toEqual([[3]]);
    expect(synced().at(-1)).toEqual({ seq: next!.seq, synced_at: SERVER_TIME });
  });

  it('counts an entry that waited on the server and turned out bad, even if it is not in the batch', async () => {
    const entries = await writeEntries(3);
    await run(() => answer({ accepted: [entries[0]!.id], last_seq: 1 })).done;
    const { done } = run(() => answer({ last_seq: 1, rejected: [{ id: entries[1]!.id, code: 'bad_hmac', expected_seq: null }] }));
    await done;
    expect(getKv(db, 'sync.rejected_through_seq')).toBe(2);
  });

  it('survives a rejection of an entry this phone does not know', async () => {
    await writeEntries(1);
    const { done } = run(() => answer({ rejected: [{ id: uuidv7(), code: 'chain_fork', expected_seq: null }] }));
    await done;
    expect(getKv(db, 'sync.rejected_through_seq')).toBeNull();
    expect(getKv(db, 'sync.pending_diagnostic')).toBeNull();
  });

  it('sends only the entries of the current enrollment', async () => {
    await writeEntries(1);
    const { api, requests } = fakeApi((request) => acceptAll(request.body));
    const deviceId = '019a2b3c-4d5e-7f00-8a00-0000000000aa';
    await pushChainEntries({ db, deviceId, mediaMissing: new Set() }, (entries) =>
      push(api, 'device-token', { device_id: deviceId, entries }),
    );
    expect(requests).toHaveLength(0);
  });
});

describe('the report of the rejected entries', () => {
  const report = {
    id: '019a2b3c-4d5e-7f00-8a00-000000000030',
    device_id: DEVICE,
    code: 'chain_gap',
    entry_id: '019a2b3c-4d5e-7f00-8a00-000000000040',
    seq: 12,
    expected_seq: 10,
    server_last_seq: 9,
    rejected_count: 3,
    occurred_at: SERVER_TIME,
  } as const;

  beforeEach(() => setKv(db, 'sync.pending_diagnostic', report));
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('goes to the server once', async () => {
    const { api, requests } = fakeApi(() => ({ server_time: SERVER_TIME }));
    await sendPendingDiagnostic(db, api, 'device-token');
    await sendPendingDiagnostic(db, api, 'device-token');
    expect(requests.map((request) => [request.method, request.path, request.body])).toEqual([['POST', '/devices/diagnostics', report]]);
    expect(getKv(db, 'sync.pending_diagnostic')).toBeNull();
  });

  it.each([
    ['no network', new TypeError('Network request failed')],
    ['a server error', [500, { error: { code: 'server_error', message: 'Hiba' } }]],
    ['the rate limit', [429, { error: { code: 'rate_limited', message: 'Túl sok' } }]],
  ] as [string, FakeAnswer][])('stays for the next sync after %s, without failing this one', async (_name, response) => {
    const { api } = fakeApi(() => response);
    await expect(sendPendingDiagnostic(db, api, 'device-token')).resolves.toBeUndefined();
    expect(getKv(db, 'sync.pending_diagnostic')).toEqual(report);
  });

  it('is dropped if the server refuses it: it would be refused again', async () => {
    const { api } = fakeApi(() => [422, { error: { code: 'validation_failed', message: 'Hibás' } }]);
    await sendPendingDiagnostic(db, api, 'device-token');
    expect(getKv(db, 'sync.pending_diagnostic')).toBeNull();
  });

  it('lets a revocation through', async () => {
    const { api } = fakeApi(() => [401, { error: { code: 'device_revoked', message: 'Visszavonva' } }]);
    await expect(sendPendingDiagnostic(db, api, 'device-token')).rejects.toMatchObject({ code: 'device_revoked' });
    expect(getKv(db, 'sync.pending_diagnostic')).toEqual(report);
  });
});
