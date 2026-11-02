import { getKv, setKv } from '@/db/kv';
import type { Database } from '@/db/database';
import { chainEntries, media } from '@/db/schema';
import { createTestDatabase, type TestDatabase } from '@/db/testing';
import { photoFile } from '@/photo/files';
import type { ClockReading } from '@/time/clock';
import { toTimestamp } from '@/time/timestamp';

import { cleanUpIfDue, cleanUpLocalData, CLEANUP_INTERVAL_MS, ORPHAN_PHOTO_AGE_MS, RETENTION_MS } from './cleanup';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));

jest.mock('expo-file-system');

const { files: mockedFiles } = jest.requireMock<typeof import('../../__mocks__/expo-file-system')>('expo-file-system');

const DEVICE = '019a2b3c-4d5e-7f00-8a00-000000000004';
const OLD_DEVICE = '019a2b3c-4d5e-7f00-8a00-0000000000aa';
const NOW_MS = Date.UTC(2026, 9, 27, 20);
const NOW = toTimestamp(NOW_MS);
const OLD = toTimestamp(NOW_MS - RETENTION_MS - 1);
const JUST_IN_TIME = toTimestamp(NOW_MS - RETENTION_MS);
const PHOTO = (n: number) => `019a2b3c-4d5e-7f00-8a00-0000000000b${n}`;

let db: Database;
let sqlite: TestDatabase['sqlite'];

function addEntry(seq: number, synced_at: string | null, device_id = DEVICE) {
  db.insert(chainEntries)
    .values({
      id: `019a2b3c-4d5e-7f00-8a00-${device_id.slice(-2)}${String(seq).padStart(10, '0')}`,
      device_id,
      seq,
      type: 'shift_closed',
      payload: { shift_id: 'x', closed_by: 'auto' },
      device_time: OLD,
      uptime_ms: 1,
      boot_id: 'boot',
      gnss_time: null,
      ref_server_time: null,
      ref_uptime_ms: null,
      ref_boot_id: null,
      prev_hash: '0'.repeat(64),
      hash: '1'.repeat(64),
      synced_at,
    })
    .run();
}

function addPhoto(id: string, uploaded_at: string | null) {
  db.insert(media)
    .values({
      id,
      device_id: DEVICE,
      owner_type: 'scan',
      owner_id: 'x',
      sha256: 'ab'.repeat(32),
      mime: 'image/jpeg',
      size_bytes: 1,
      local_uri: 'file:///x',
      taken_at: OLD,
      uploaded_at,
    })
    .run();
  addFile(id, NOW_MS - RETENTION_MS * 2);
}

const addFile = (id: string, modifiedAtMs: number) => mockedFiles.set(photoFile(id).uri, { size: 1, modifiedAtMs });
const seqs = (device = DEVICE) =>
  (sqlite.prepare('SELECT seq FROM chain_entries WHERE device_id = ? ORDER BY seq').all(device) as { seq: number }[]).map((row) => row.seq);
const photoRows = () => (sqlite.prepare('SELECT id FROM media ORDER BY id').all() as { id: string }[]).map((row) => row.id);
const hasFile = (id: string) => mockedFiles.has(photoFile(id).uri);

beforeEach(async () => {
  ({ db, sqlite } = await createTestDatabase());
  mockedFiles.clear();
});

describe('local cleanup', () => {
  it('deletes the acknowledged entries older than 7 days, and keeps what is newer or not acknowledged', () => {
    addEntry(1, OLD);
    addEntry(2, JUST_IN_TIME);
    addEntry(3, null);
    addEntry(4, NOW);
    cleanUpLocalData(db, NOW, NOW_MS);
    expect(seqs()).toEqual([2, 3, 4]);
  });

  it('always keeps the last entry of a chain, the next one links to it', () => {
    addEntry(1, OLD);
    addEntry(2, OLD);
    addEntry(1, OLD, OLD_DEVICE);
    cleanUpLocalData(db, NOW, NOW_MS);
    expect(seqs()).toEqual([2]);
    expect(seqs(OLD_DEVICE)).toEqual([1]);
  });

  it('keeps an entry a rejection holds back, however old', () => {
    addEntry(1, null);
    addEntry(2, null);
    cleanUpLocalData(db, toTimestamp(NOW_MS + 365 * RETENTION_MS), NOW_MS);
    expect(seqs()).toEqual([1, 2]);
  });

  it('deletes the uploaded photos older than 7 days with their files, and keeps the others', () => {
    addPhoto(PHOTO(1), OLD);
    addPhoto(PHOTO(2), JUST_IN_TIME);
    addPhoto(PHOTO(3), null);
    cleanUpLocalData(db, NOW, NOW_MS);
    expect(photoRows()).toEqual([PHOTO(2), PHOTO(3)]);
    expect([1, 2, 3].map((n) => hasFile(PHOTO(n)))).toEqual([false, true, true]);
  });

  it('deletes the row of a photo whose file is gone', () => {
    addPhoto(PHOTO(1), OLD);
    mockedFiles.clear();
    cleanUpLocalData(db, NOW, NOW_MS);
    expect(photoRows()).toEqual([]);
  });

  it('deletes a file without a row after a day, and not before', () => {
    addFile(PHOTO(1), NOW_MS - ORPHAN_PHOTO_AGE_MS - 1);
    addFile(PHOTO(2), NOW_MS - ORPHAN_PHOTO_AGE_MS + 1);
    cleanUpLocalData(db, NOW, NOW_MS);
    expect(hasFile(PHOTO(1))).toBe(false);
    expect(hasFile(PHOTO(2))).toBe(true);
  });

  it('leaves other files in the directory alone, and copes with no directory', () => {
    cleanUpLocalData(db, NOW, NOW_MS);
    mockedFiles.set('file:///documents/media/notes.txt', { size: 1, modifiedAtMs: 0 });
    cleanUpLocalData(db, NOW, NOW_MS);
    expect(mockedFiles.has('file:///documents/media/notes.txt')).toBe(true);
  });

  it('runs once a day at most, by the trusted time', () => {
    let nowMs = NOW_MS;
    const readClock = (): ClockReading => ({ device_time: toTimestamp(nowMs), uptime_ms: 1, boot_id: 'boot' });
    addEntry(1, OLD);
    addEntry(2, NOW);
    cleanUpIfDue(db, readClock);
    expect(seqs()).toEqual([2]);
    expect(getKv(db, 'sync.last_cleanup_at')).toBe(NOW);

    addEntry(0, OLD);
    nowMs += CLEANUP_INTERVAL_MS - 1;
    cleanUpIfDue(db, readClock);
    expect(seqs()).toEqual([0, 2]);

    nowMs += 1;
    cleanUpIfDue(db, readClock);
    expect(seqs()).toEqual([2]);
    setKv(db, 'sync.last_cleanup_at', toTimestamp(nowMs));
  });
});
