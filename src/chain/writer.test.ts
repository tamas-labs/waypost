import type { ChainEntry, ChainEntryOf, ChainEntryType } from '@waypost/schema';
import { chainVectors } from '@waypost/schema/vectors';
import { asc } from 'drizzle-orm';

import { setDeviceCredentials } from '@/auth/credentials';
import type { Database } from '@/db/database';
import { deleteKv, setKv } from '@/db/kv';
import { chainEntries, incidents, media, rounds, scans, shifts } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { uuidv7 } from '@/id/uuidv7';
import { notifyChainEntry } from '@/sync/runtime';
import type { ClockReading } from '@/time/clock';

import { onChainEntries } from './events';
import { GENESIS_HASH, verifyChainEntry } from './hmac';
import { incident, roundClosed, roundOpened, scan, shiftClosed, shiftStarted, type PhotoFile } from './payloads';
import { ProjectionError } from './projection';
import { appendChainEntries, appendChainEntry, appendDecidedEntries, ChainWriteError, type ChainWriterOptions } from './writer';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('@/sync/runtime', () => ({ notifyChainEntry: jest.fn() }));
jest.mock('@/id/uuidv7', () => {
  const actual = jest.requireActual<typeof import('@/id/uuidv7')>('@/id/uuidv7');
  return { ...actual, uuidv7: jest.fn(actual.uuidv7) };
});

const KEY = chainVectors.key_base64;
/** An entry of the shared linked chain, with its hash. */
function vectorEntry<T extends ChainEntryType>(index: number, type: T): ChainEntryOf<T> {
  const vector = chainVectors.chain.entries[index];
  if (vector?.input.type !== type) throw new Error(`Chain vector ${index} is not ${type}`);
  return { ...vector.input, hash: vector.hash } as ChainEntryOf<T>;
}

const FIRST = vectorEntry(0, 'shift_started');
const SECOND = vectorEntry(1, 'round_opened');
const THIRD = vectorEntry(2, 'scan');
const DEVICE = FIRST.device_id;
const SITE = '019a2b3c-4d5e-7f00-8a00-000000000001';
const GUARD = '019a2b3c-4d5e-7f00-8a00-000000000003';
const SHIFT = '019a2b3c-4d5e-7f00-8a00-000000000020';
const ROUND = '019a2b3c-4d5e-7f00-8a00-000000000021';
const CHECKPOINT = '019a2b3c-4d5e-7f00-8a00-000000000006';
const ROUND_FIELDS = { route_version_id: '019a2b3c-4d5e-7f00-8a00-000000000008', schedule_id: '019a2b3c-4d5e-7f00-8a00-000000000009', scheduled_at: '2026-10-27T20:00:00.000Z', time_limit_min: 20 };

let db: Database;
let clockMs: number;
/** A clock that moves 1 s at every reading. */
const readClock = (): ClockReading => {
  clockMs += 1000;
  return { device_time: new Date(clockMs).toISOString(), uptime_ms: clockMs - Date.UTC(2026, 9, 27), boot_id: 'android-17' };
};
const options: ChainWriterOptions = { readClock };

const allEntries = () => db.select().from(chainEntries).orderBy(asc(chainEntries.seq)).all();
const startShift = (shift_id = SHIFT) => appendChainEntry(db, shiftStarted({ shift_id, guard_id: GUARD, site_id: SITE }), options);
const openRound = (round_id = ROUND) => appendChainEntry(db, roundOpened({ round_id, shift_id: SHIFT, ...ROUND_FIELDS }), options);
const scanCheckpoint = (scan_id: string, checkpoint_id: string | null = CHECKPOINT) =>
  appendChainEntry(
    db,
    scan({ scan_id, round_id: ROUND, checkpoint_id, method: 'qr', qr_payload: 'waypost:cp:x', location: null, flags: checkpoint_id === null ? ['unknown_tag'] : [] }),
    options,
  );

beforeEach(async () => {
  ({ db } = await createTestDatabase());
  setKv(db, 'device.id', DEVICE);
  await setDeviceCredentials({ token: 'device-token', secret: KEY });
  clockMs = Date.UTC(2026, 9, 27, 20, 0, 0);
  jest.mocked(notifyChainEntry).mockClear();
});

describe('chain writer', () => {
  it('writes the shared chain vector: the same entries and hashes, with their projections', async () => {
    setKv(db, 'sync.time_ref', { server_time: FIRST.ref_server_time!, uptime_ms: FIRST.ref_uptime_ms!, boot_id: FIRST.ref_boot_id! });
    const vectors = [FIRST, SECOND, THIRD];
    for (const vector of vectors) jest.mocked(uuidv7).mockReturnValueOnce(vector.id);
    const clocks = vectors.map(({ device_time, uptime_ms, boot_id }) => ({ device_time, uptime_ms, boot_id }));
    const vectorClock = () => clocks.shift()!;

    const written = [
      await appendChainEntry(db, shiftStarted(FIRST.payload), { readClock: vectorClock }),
      ...(await appendChainEntries(
        db,
        [
          roundOpened(SECOND.payload),
          scan({ ...THIRD.payload, flags: [], location: { latitude: 47.4979, longitude: 19.0402, accuracy_m: 12.5, mocked: false, gnss_time: null } }),
        ],
        { readClock: vectorClock },
      )),
    ];

    expect(written).toEqual(vectors);
    expect(allEntries()).toEqual(vectors.map((entry) => ({ ...entry, synced_at: null })));
    expect(db.select().from(shifts).all()).toEqual([{ id: SHIFT, site_id: SITE, device_id: DEVICE, guard_id: GUARD, started_at: FIRST.device_time, ended_at: null, closed_by: null, chain_entry_id: FIRST.id }]);
    expect(db.select().from(rounds).all()).toEqual([{ id: ROUND, shift_id: SHIFT, ...ROUND_FIELDS, started_at: THIRD.device_time, finished_at: null, status: 'in_progress' }]);
    expect(db.select().from(scans).all()).toEqual([
      expect.objectContaining({ id: '019a2b3c-4d5e-7f00-8a00-000000000022', round_id: ROUND, method: 'qr', scanned_at: THIRD.device_time, lat_e7: 474979000, is_mock: false, flags: [], chain_entry_id: THIRD.id }),
    ]);
    expect(notifyChainEntry).toHaveBeenCalledTimes(2);
  });

  it('starts the chain at seq 1 with 64 zeros, without a sync reference before the first sync', async () => {
    const entry = await startShift();
    expect(entry).toMatchObject({ seq: 1, device_id: DEVICE, prev_hash: GENESIS_HASH, gnss_time: null, ref_server_time: null, ref_uptime_ms: null, ref_boot_id: null });
    expect(entry).toMatchObject({ device_time: '2026-10-27T20:00:01.000Z', uptime_ms: 72_001_000, boot_id: 'android-17' });
    expect(verifyChainEntry(entry, KEY)).toBe(true);
  });

  it('records the GNSS time of the location', async () => {
    const entry = await appendChainEntry(
      db,
      incident({ incident_id: uuidv7(), shift_id: SHIFT, category: 'water', location: { latitude: 47.5, longitude: 19, accuracy_m: 4, mocked: false, gnss_time: '2026-10-27T19:59:59.000Z' } }),
      options,
    );
    expect(entry.gnss_time).toBe('2026-10-27T19:59:59.000Z');
  });

  it('keeps seq continuous and in call order under parallel writes', async () => {
    const ids = Array.from({ length: 20 }, () => uuidv7());
    // The secret arrives in random order, so without the lock the writes would interleave.
    const slowSecret = () => new Promise<string>((resolve) => setTimeout(() => resolve(KEY), Math.floor(Math.random() * 5)));
    const written = await Promise.all(
      ids.map((incident_id) => appendChainEntry(db, incident({ incident_id, shift_id: SHIFT, category: 'other', location: null }), { readClock, readSecret: slowSecret })),
    );

    const stored = allEntries();
    expect(stored.map((entry) => entry.seq)).toEqual(ids.map((_, i) => i + 1));
    expect(stored.map((entry) => (entry.payload as { incident_id: string }).incident_id)).toEqual(ids);
    expect(written.map((entry) => entry.seq)).toEqual(ids.map((_, i) => i + 1));
    stored.forEach((entry, i) => {
      expect(entry.prev_hash).toBe(i === 0 ? GENESIS_HASH : stored[i - 1]!.hash);
      const { synced_at: _synced, ...signed } = entry;
      expect(verifyChainEntry(signed as ChainEntry, KEY)).toBe(true);
    });
    expect(db.select().from(incidents).all()).toHaveLength(20);
  });

  it('writes neither entries nor projections if one entry of a request fails, and seq does not move', async () => {
    await startShift();
    await expect(
      appendChainEntries(db, [roundOpened({ round_id: ROUND, shift_id: SHIFT, ...ROUND_FIELDS }), shiftClosed({ shift_id: uuidv7(), closed_by: 'guard' })], options),
    ).rejects.toThrow(ProjectionError);
    // The same shift again: the projection's primary key fails after the entry was inserted.
    await expect(startShift()).rejects.toThrow();

    expect(allEntries().map((entry) => entry.seq)).toEqual([1]);
    expect(db.select().from(rounds).all()).toEqual([]);
    expect(db.select().from(shifts).all()).toHaveLength(1);
    expect(notifyChainEntry).toHaveBeenCalledTimes(1);

    const next = await openRound();
    expect(next).toMatchObject({ seq: 2, prev_hash: allEntries()[0]!.hash });
  });

  it('rejects an entry that is not valid for the chain schema', async () => {
    const draft = scan({ scan_id: uuidv7(), round_id: null, checkpoint_id: CHECKPOINT, method: 'nfc', location: null });
    await expect(appendChainEntry(db, draft, options)).rejects.toThrow(/^Invalid scan entry: \/payload/);
    expect(allEntries()).toEqual([]);
  });

  it('does not write without a device ID or a secret, and the next write still goes through', async () => {
    deleteKv(db, 'device.id');
    await expect(startShift()).rejects.toThrow(new ChainWriteError('No device ID: the phone is not enrolled'));
    setKv(db, 'device.id', DEVICE);
    await expect(appendChainEntry(db, shiftStarted({ shift_id: SHIFT, guard_id: GUARD, site_id: SITE }), { readClock, readSecret: async () => null })).rejects.toThrow(
      new ChainWriteError('No device secret: the phone is not enrolled'),
    );
    expect(allEntries()).toEqual([]);

    await expect(startShift()).resolves.toMatchObject({ seq: 1 });
    await expect(appendChainEntries(db, [], options)).resolves.toEqual([]);
    expect(notifyChainEntry).toHaveBeenCalledTimes(1);
  });

  it('decides under the lock: a decision reads the state the earlier writes left', async () => {
    await startShift();
    const slowSecret = () => new Promise<string>((resolve) => setTimeout(() => resolve(KEY), 5));
    // Two rules wanting to open the same round at once: the second sees the first one's round and opens none.
    const openOnce = () =>
      appendDecidedEntries(
        db,
        () => {
          const exists = db.select().from(rounds).all().length > 0;
          return { exists, drafts: exists ? [] : [roundOpened({ round_id: uuidv7(), shift_id: SHIFT, ...ROUND_FIELDS })] };
        },
        { readClock, readSecret: slowSecret },
      );
    const [first, second] = await Promise.all([openOnce(), openOnce()]);

    expect(first.decision.exists).toBe(false);
    expect(first.entries).toEqual([expect.objectContaining({ seq: 2, type: 'round_opened' })]);
    expect(second).toEqual({ decision: { exists: true, drafts: [] }, entries: [] });
    expect(db.select().from(rounds).all()).toHaveLength(1);
  });

  it('tells the listeners the entries of a committed write, and nothing of a failed one', async () => {
    const heard: number[][] = [];
    const unsubscribe = onChainEntries((entries) => heard.push(entries.map((entry) => entry.seq)));
    await startShift();
    await expect(startShift()).rejects.toThrow();
    await appendChainEntries(db, [roundOpened({ round_id: ROUND, shift_id: SHIFT, ...ROUND_FIELDS }), shiftClosed({ shift_id: SHIFT, closed_by: 'guard' })], options);
    unsubscribe();
    await openRound(uuidv7()).catch(() => undefined);
    expect(heard).toEqual([[1], [2, 3]]);
  });

  it('starts a new chain for a newly enrolled device', async () => {
    await startShift();
    setKv(db, 'device.id', '019a2b3c-4d5e-7f00-8a00-0000000000d2');
    await expect(appendChainEntry(db, shiftClosed({ shift_id: SHIFT, closed_by: 'guard' }), options)).resolves.toMatchObject({ seq: 1, prev_hash: GENESIS_HASH });
  });
});

describe('chain projections', () => {
  beforeEach(async () => {
    await startShift();
    await openRound();
  });

  const round = () => db.select().from(rounds).get();

  it('start a round at its first scan of a checkpoint, not at an unknown tag', async () => {
    await scanCheckpoint(uuidv7(), null);
    expect(round()).toMatchObject({ status: 'open', started_at: null });
    const first = await scanCheckpoint(uuidv7());
    await scanCheckpoint(uuidv7());
    expect(round()).toMatchObject({ status: 'in_progress', started_at: first.device_time });
  });

  it('close rounds and shifts', async () => {
    await appendChainEntry(db, roundClosed({ round_id: ROUND, status: 'missed', finished_at: '2026-10-27T20:20:00.000Z' }), options);
    expect(round()).toMatchObject({ status: 'missed', finished_at: '2026-10-27T20:20:00.000Z' });
    const closed = await appendChainEntry(db, shiftClosed({ shift_id: SHIFT, closed_by: 'handover' }), options);
    expect(db.select().from(shifts).get()).toMatchObject({ ended_at: closed.device_time, closed_by: 'handover' });
  });

  it('store incidents with the entry time', async () => {
    const entry = await appendChainEntry(db, incident({ incident_id: uuidv7(), shift_id: SHIFT, category: 'open_door', note: 'Nyitva.', location: null }), options);
    expect(db.select().from(incidents).get()).toMatchObject({ category: 'open_door', note: 'Nyitva.', occurred_at: entry.device_time, chain_entry_id: entry.id });
  });

  it('reject entries for closed or unknown rounds and shifts', async () => {
    await appendChainEntry(db, roundClosed({ round_id: ROUND, status: 'missed', finished_at: '2026-10-27T20:20:00.000Z' }), options);
    await expect(scanCheckpoint(uuidv7())).rejects.toThrow(new ProjectionError(`Round ${ROUND} is already closed`));
    await expect(appendChainEntry(db, roundClosed({ round_id: ROUND, status: 'completed', finished_at: '2026-10-27T20:21:00.000Z' }), options)).rejects.toThrow(ProjectionError);
    const unknown = uuidv7();
    await expect(appendChainEntry(db, roundClosed({ round_id: unknown, status: 'missed', finished_at: '2026-10-27T20:20:00.000Z' }), options)).rejects.toThrow(
      new ProjectionError(`Unknown round ${unknown}`),
    );

    await appendChainEntry(db, shiftClosed({ shift_id: SHIFT, closed_by: 'guard' }), options);
    await expect(appendChainEntry(db, shiftClosed({ shift_id: SHIFT, closed_by: 'auto' }), options)).rejects.toThrow(new ProjectionError(`Shift ${SHIFT} is already closed`));
    await expect(openRound(uuidv7())).rejects.toThrow(ProjectionError);
    expect(allEntries()).toHaveLength(4);
  });

  const photo = (sha: string): PhotoFile => {
    const id = uuidv7();
    return { id, sha256: sha.repeat(64), mime: 'image/jpeg', size_bytes: 245_000, local_uri: `file:///data/media/${id}.jpg`, taken_at: '2026-10-27T20:04:00.000Z' };
  };

  it('record the photos with the entries citing them, owned by the first one', async () => {
    const photos = [photo('a'), photo('b')];
    const scanId = uuidv7();
    const incidentId = uuidv7();
    const manual = scan({ scan_id: scanId, round_id: ROUND, checkpoint_id: CHECKPOINT, method: 'manual', location: null, flags: ['manual'], note: 'Leszakadt.', media: photos });
    const damaged = incident({ incident_id: incidentId, shift_id: SHIFT, category: 'damaged_tag', note: 'Leszakadt.', location: null, scan_id: scanId, media: photos });
    await appendChainEntries(db, [manual, damaged], { ...options, photos });
    expect(db.select().from(media).orderBy(asc(media.id)).all()).toEqual(photos.map((p) => ({ ...p, owner_type: 'scan', owner_id: scanId, uploaded_at: null })));
    const incidentPhoto = photo('c');
    await appendChainEntries(db, [incident({ incident_id: uuidv7(), shift_id: SHIFT, category: 'water', note: null, location: null, media: [incidentPhoto] })], { ...options, photos: [incidentPhoto] });
    expect(db.select().from(media).all().find((row) => row.id === incidentPhoto.id)).toMatchObject({ owner_type: 'incident' });
  });

  it('write nothing if a cited photo is missing or differs, or a photo is not cited', async () => {
    const given = photo('a');
    const cites = (refs: { id: string; sha256: string }[]) => incident({ incident_id: uuidv7(), shift_id: SHIFT, category: 'water', note: null, location: null, media: refs });
    await expect(appendChainEntries(db, [cites([given])], options)).rejects.toThrow(ProjectionError);
    await expect(appendChainEntries(db, [cites([{ id: given.id, sha256: 'f'.repeat(64) }])], { ...options, photos: [given] })).rejects.toThrow(ProjectionError);
    await expect(appendChainEntries(db, [cites([])], { ...options, photos: [given] })).rejects.toThrow(new ChainWriteError(`Photos not cited by any entry: ${given.id}`));
    await expect(appendChainEntries(db, [], { ...options, photos: [given] })).rejects.toThrow(ChainWriteError);
    expect(db.select().from(media).all()).toEqual([]);
    expect(db.select().from(incidents).all()).toEqual([]);
    expect(allEntries()).toHaveLength(2);
  });
});
