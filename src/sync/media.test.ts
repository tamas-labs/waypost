import { eq } from 'drizzle-orm';

import type { Database } from '@/db/database';
import { chainEntries, incidents, media, scans } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { photoFile } from '@/photo/files';

import { uploadPhotos } from './media';
import { countPending } from './pending';
import { setKv } from '@/db/kv';
import { fakeApi, type FakeAnswer, type RecordedRequest } from './testing';

jest.mock('expo-file-system');

const { files: mockedFiles } = jest.requireMock<typeof import('../../__mocks__/expo-file-system')>('expo-file-system');

const DEVICE = '019a2b3c-4d5e-7f00-8a00-000000000004';
const OTHER_DEVICE = '019a2b3c-4d5e-7f00-8a00-0000000000aa';
const SCAN = '019a2b3c-4d5e-7f00-8a00-000000000022';
const PHOTO = (n: number) => `019a2b3c-4d5e-7f00-8a00-0000000000b${n}`;
const SHA = 'ab'.repeat(32);
const UPLOADED_AT = '2026-10-27T21:00:00.000Z';

let db: Database;

function addPhoto(id: string, fields: Partial<typeof media.$inferInsert> = {}, withFile = true) {
  db.insert(media)
    .values({
      id,
      device_id: DEVICE,
      owner_type: 'scan',
      owner_id: SCAN,
      sha256: SHA,
      mime: 'image/jpeg',
      size_bytes: 1000,
      // Stale on purpose: iOS moves the documents at an update.
      local_uri: `file:///old-container/media/${id}.jpg`,
      taken_at: '2026-10-27T20:00:00.000Z',
      uploaded_at: null,
      ...fields,
    })
    .run();
  if (withFile) mockedFiles.set(photoFile(id).uri, { size: 1000, modifiedAtMs: 0 });
}

const stored = (request: RecordedRequest): FakeAnswer => {
  const id = request.path.slice('/media/'.length);
  return {
    server_time: UPLOADED_AT,
    media: {
      id,
      device_id: DEVICE,
      owner_type: 'scan',
      owner_id: SCAN,
      sha256: SHA,
      mime: 'image/jpeg',
      size_bytes: 1000,
      taken_at: '2026-10-27T20:00:00.000Z',
      uploaded_at: UPLOADED_AT,
    },
  };
};

function upload(answer: (request: RecordedRequest) => FakeAnswer, asked: string[] = []) {
  const { api, requests } = fakeApi(answer);
  return { done: uploadPhotos({ db, api, token: 'device-token', deviceId: DEVICE, mediaMissing: new Set(asked) }), requests };
}

const uploadedAt = (id: string) => db.select({ at: media.uploaded_at }).from(media).where(eq(media.id, id)).get()?.at;
const apiError = (status: number, code: string): FakeAnswer => [status, { error: { code, message: 'Hiba' } }];

beforeEach(async () => {
  ({ db } = await createTestDatabase());
  setKv(db, 'device.id', DEVICE);
  mockedFiles.clear();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('photo upload', () => {
  it('sends a photo with its fields and its file as multipart, and marks it uploaded', async () => {
    addPhoto(PHOTO(1));
    const { done, requests } = upload(stored);
    await done;

    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect([request!.method, request!.path]).toEqual(['PUT', `/media/${PHOTO(1)}`]);
    expect(request!.headers.Authorization).toBe('Bearer device-token');
    expect(request!.headers['Idempotency-Key']).toEqual(expect.any(String));
    // Without a Content-Type of its own: the boundary is set by the request.
    expect(request!.headers['Content-Type']).toBeUndefined();
    expect(request!.body).toEqual({ sha256: SHA, owner_type: 'scan', owner_id: SCAN, taken_at: '2026-10-27T20:00:00.000Z' });
    // The file is found by its ID in the current documents, not by the stored URI.
    expect(request!.file).toEqual(photoFile(PHOTO(1)));
    expect(photoFile(PHOTO(1)).uri).toBe(`file:///documents/media/${PHOTO(1)}.jpg`);
    expect(uploadedAt(PHOTO(1))).toBe(UPLOADED_AT);
  });

  it('goes one by one, and sends nothing again', async () => {
    addPhoto(PHOTO(2));
    addPhoto(PHOTO(1));
    const first = upload(stored);
    await first.done;
    expect(first.requests.map((request) => request.path)).toEqual([`/media/${PHOTO(1)}`, `/media/${PHOTO(2)}`]);
    expect(countPending(db).media).toBe(0);

    const second = upload(stored);
    await second.done;
    expect(second.requests).toHaveLength(0);
  });

  it('uses a new Idempotency-Key at every attempt: the server remembers a 404 for the key', async () => {
    addPhoto(PHOTO(1));
    const first = upload(() => apiError(404, 'not_found'));
    await first.done;
    const second = upload(stored);
    await second.done;
    expect(first.requests[0]!.headers['Idempotency-Key']).not.toBe(second.requests[0]!.headers['Idempotency-Key']);
    expect(uploadedAt(PHOTO(1))).toBe(UPLOADED_AT);
  });

  it('sends what the server asks for, even if it was uploaded here; and ignores what is not here', async () => {
    addPhoto(PHOTO(1), { uploaded_at: '2026-10-27T20:30:00.000Z' });
    const { done, requests } = upload(stored, [PHOTO(1), PHOTO(9)]);
    await done;
    expect(requests.map((request) => request.path)).toEqual([`/media/${PHOTO(1)}`]);
    expect(uploadedAt(PHOTO(1))).toBe(UPLOADED_AT);
  });

  it('skips a file that is gone, and goes on', async () => {
    addPhoto(PHOTO(1), {}, false);
    addPhoto(PHOTO(2));
    const { done, requests } = upload(stored);
    await done;
    expect(requests.map((request) => request.path)).toEqual([`/media/${PHOTO(2)}`]);
    expect(uploadedAt(PHOTO(1))).toBeNull();
    expect(countPending(db).media).toBe(1);
  });

  it('does not touch the photos of an earlier enrollment', async () => {
    addPhoto(PHOTO(1), { device_id: OTHER_DEVICE });
    const { done, requests } = upload(stored);
    await done;
    expect(requests).toHaveLength(0);
    expect(countPending(db).media).toBe(0);
  });

  it('waits until the entry of the photo is acknowledged, and does not need it after it is cleaned up', async () => {
    addPhoto(PHOTO(1));
    const entry = (synced_at: string | null) => ({
      id: 'entry',
      device_id: DEVICE,
      seq: 1,
      type: 'scan' as const,
      payload: {} as never,
      device_time: UPLOADED_AT,
      uptime_ms: 1,
      boot_id: 'boot',
      prev_hash: '0'.repeat(64),
      hash: '1'.repeat(64),
      synced_at,
    });
    db.insert(scans).values({ id: SCAN, method: 'nfc', scanned_at: UPLOADED_AT, is_mock: false, flags: [], chain_entry_id: 'entry' }).run();
    db.insert(chainEntries).values(entry(null)).run();
    const waiting = upload(stored);
    await waiting.done;
    expect(waiting.requests).toHaveLength(0);
    expect(countPending(db).media).toBe(1);

    db.update(chainEntries).set({ synced_at: UPLOADED_AT }).run();
    const acknowledged = upload(stored);
    await acknowledged.done;
    expect(acknowledged.requests).toHaveLength(1);

    db.update(media).set({ uploaded_at: null }).run();
    db.delete(chainEntries).run();
    const cleaned = upload(stored);
    await cleaned.done;
    expect(cleaned.requests).toHaveLength(1);
  });

  it('waits for the entry of an incident photo as well', async () => {
    addPhoto(PHOTO(1), { owner_type: 'incident', owner_id: 'incident' });
    db.insert(incidents)
      .values({ id: 'incident', shift_id: 'shift', category: 'water', occurred_at: UPLOADED_AT, chain_entry_id: 'entry' })
      .run();
    db.insert(chainEntries)
      .values({
        id: 'entry',
        device_id: DEVICE,
        seq: 1,
        type: 'incident',
        payload: {} as never,
        device_time: UPLOADED_AT,
        uptime_ms: 1,
        boot_id: 'boot',
        prev_hash: '0'.repeat(64),
        hash: '1'.repeat(64),
      })
      .run();
    const { done, requests } = upload(stored);
    await done;
    expect(requests).toHaveLength(0);
  });

  it('sends a photo from before the device_id column', async () => {
    addPhoto(PHOTO(1), { device_id: null });
    const { done, requests } = upload(stored);
    await done;
    expect(requests).toHaveLength(1);
  });

  it("leaves a checkpoint photo to its outbox call, which sends it in the supervisor's name", async () => {
    addPhoto(PHOTO(1), { device_id: null, owner_type: 'checkpoint', owner_id: '019a2b3c-4d5e-7f00-8a00-0000000000c5' });
    const { done, requests } = upload(stored, [PHOTO(1)]);
    await done;
    expect(requests).toHaveLength(0);
  });

  it.each([
    [404, 'not_found'],
    [403, 'forbidden'],
    [413, 'bad_request'],
    [422, 'validation_failed'],
  ])('goes on with the others after a %i, and tries that photo again at the next sync', async (status, code) => {
    addPhoto(PHOTO(1));
    addPhoto(PHOTO(2));
    const first = upload((request) => (request.path.endsWith(PHOTO(1)) ? apiError(status, code) : stored(request)));
    await first.done;
    expect(uploadedAt(PHOTO(1))).toBeNull();
    expect(uploadedAt(PHOTO(2))).toBe(UPLOADED_AT);

    const second = upload(stored);
    await second.done;
    expect(second.requests.map((request) => request.path)).toEqual([`/media/${PHOTO(1)}`]);
  });

  it.each([
    ['no network', new TypeError('Network request failed'), { name: 'NetworkError' }],
    ['a server error', apiError(500, 'server_error'), { code: 'server_error' }],
    ['the rate limit', apiError(429, 'rate_limited'), { code: 'rate_limited' }],
    ['an unaccepted token', apiError(401, 'unauthenticated'), { code: 'unauthenticated' }],
    ['a revocation', apiError(401, 'device_revoked'), { code: 'device_revoked' }],
  ] as [string, FakeAnswer, object][])('stops after %s; the next sync goes on from there', async (_name, answer, error) => {
    addPhoto(PHOTO(1));
    addPhoto(PHOTO(2));
    const first = upload(() => answer);
    await expect(first.done).rejects.toMatchObject(error);
    expect(first.requests).toHaveLength(1);
    expect(countPending(db).media).toBe(2);

    const second = upload(stored);
    await second.done;
    expect(countPending(db).media).toBe(0);
  });
});
