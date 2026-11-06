import NetInfo from '@react-native-community/netinfo';
import type { SyncPushFinalRequest } from '@waypost/schema';
import { chainVectors } from '@waypost/schema/vectors';
import { AppState } from 'react-native';

import * as config from '@/api/config';
import * as client from '@/api/client';
import { logIn, useSession } from '@/auth/session';
import { shiftStarted } from '@/chain/payloads';
import { appendChainEntries, appendChainEntry, ChainWriteError } from '@/chain/writer';
import type { Database } from '@/db/database';
import { getKv, setKv } from '@/db/kv';
import { chainEntries, devices, media, users } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { getDeviceCredentials, setDeviceCredentials } from '@/device/credentials';
import { uuidv7 } from '@/id/uuidv7';
import { photoFile } from '@/photo/files';
import type { ClockReading } from '@/time/clock';

import { startSync, requestSync } from './runtime';
import { useSyncStatus } from './status';
import { fakeApi, type FakeAnswer, type RecordedRequest } from './testing';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));

jest.mock('expo-file-system');

const { files: mockedFiles } = jest.requireMock<typeof import('../../__mocks__/expo-file-system')>('expo-file-system');

const DEVICE = '019a2b3c-4d5e-7f00-8a00-000000000004';
const SITE = '019a2b3c-4d5e-7f00-8a00-000000000001';
const GUARD = '019a2b3c-4d5e-7f00-8a00-000000000003';
const SCAN = '019a2b3c-4d5e-7f00-8a00-000000000022';
const PHOTO = '019a2b3c-4d5e-7f00-8a00-0000000000b1';
const SHA = 'ab'.repeat(32);
const SERVER_TIME = '2026-10-27T21:00:00.000Z';
const REVOKED: FakeAnswer = [401, { error: { code: 'device_revoked', message: 'Visszavonva' } }];
const SECRET = chainVectors.key_base64;

let db: Database;
let clockMs = Date.UTC(2026, 9, 27, 20);
const readClock = (): ClockReading => {
  clockMs += 1000;
  return { device_time: new Date(clockMs).toISOString(), uptime_ms: clockMs - Date.UTC(2026, 9, 27), boot_id: 'android-17' };
};
const writer = { readClock, readSecret: async () => SECRET };

function writeEntries(n: number) {
  const drafts = Array.from({ length: n }, () => shiftStarted({ shift_id: uuidv7(), guard_id: GUARD, site_id: SITE }));
  return appendChainEntries(db, drafts, writer);
}

function addPhoto() {
  db.insert(media)
    .values({
      id: PHOTO,
      device_id: DEVICE,
      owner_type: 'scan',
      owner_id: SCAN,
      sha256: SHA,
      mime: 'image/jpeg',
      size_bytes: 1000,
      local_uri: 'file:///x',
      taken_at: SERVER_TIME,
      uploaded_at: null,
    })
    .run();
  mockedFiles.set(photoFile(PHOTO).uri, { size: 1000, modifiedAtMs: clockMs });
}

/** The server of a revoked phone: every endpoint but the last upload answers device_revoked, until the upload closes. */
function revokedServer(override?: (request: RecordedRequest) => FakeAnswer | undefined) {
  let closed = false;
  const answer = (request: RecordedRequest): FakeAnswer => {
    const special = override?.(request);
    if (special !== undefined) return special;
    if (closed || !(request.path === '/sync/push-final' || request.path.startsWith('/media/'))) return REVOKED;
    if (request.path.startsWith('/media/')) {
      return {
        server_time: SERVER_TIME,
        media: {
          id: PHOTO,
          device_id: DEVICE,
          owner_type: 'scan',
          owner_id: SCAN,
          sha256: SHA,
          mime: 'image/jpeg',
          size_bytes: 1000,
          taken_at: SERVER_TIME,
          uploaded_at: SERVER_TIME,
        },
      };
    }
    const { entries, done } = request.body as SyncPushFinalRequest;
    if (done) closed = true;
    return {
      server_time: SERVER_TIME,
      accepted: entries.map((entry) => entry.id),
      last_seq: entries.at(-1)?.seq ?? 0,
      rejected: [],
      media_missing: [],
    };
  };
  const fake = fakeApi(answer);
  jest.spyOn(client, 'createApiClient').mockReturnValue(fake.api);
  return fake;
}

/** Lets the syncs that follow each other settle. */
const settle = async () => {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

let stop: () => void;

beforeEach(async () => {
  // The device clock runs from the server time of the answers: the cleanup after a good sync reads it (with no time
  // reference here), and with the real date the acknowledged entries would be past their 7 days (audit WP-APP-004).
  const realNow = Date.now.bind(Date);
  const offset = realNow() - Date.parse(SERVER_TIME);
  jest.spyOn(Date, 'now').mockImplementation(() => realNow() - offset);
  ({ db } = await createTestDatabase());
  mockedFiles.clear();
  setKv(db, 'device.id', DEVICE);
  jest.spyOn(config, 'apiBaseUrl').mockReturnValue('https://waypost.example/api/waypost/v1');
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
  Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });
  jest.mocked(NetInfo.addEventListener).mockReturnValue(jest.fn());
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  await setDeviceCredentials({ token: 'device-token', secret: SECRET });
  useSession.setState({ mode: 'site_phone', deviceId: DEVICE, activeUser: null });
  useSyncStatus.setState({ online: null, running: false, pendingCount: 0, lastSuccessAt: null, lastError: null, replaced: false });
  stop = () => {};
});

afterEach(() => {
  stop();
  jest.restoreAllMocks();
});

const paths = (requests: RecordedRequest[]) => requests.map((request) => request.path);

describe('a revoked phone', () => {
  it('goes through its last upload at the first device_revoked: batches, photos, done, then it is not enrolled', async () => {
    await writeEntries(201);
    addPhoto();
    // A supervisor's training of the site, not saved.
    setKv(db, 'training.draft', {
      site_id: '019a2b3c-4d5e-7f00-8a00-0000000000a1',
      supervisor_id: GUARD,
      route: { id: 'r', name: '', order_mode: 'free' },
      saved_order_mode: null,
      started: { uptime_ms: 0, boot_id: 'android-boot:12' },
      points: [],
    });
    db.insert(users)
      .values({
        id: GUARD,
        name: 'Kiss Péter',
        role: 'guard',
        pin_hash: 'x',
        pin_salt: 'y',
        pin_iterations: 1,
        active: true,
        created_at: SERVER_TIME,
        updated_at: SERVER_TIME,
      })
      .run();
    logIn({ id: GUARD, role: 'guard' });
    const { requests } = revokedServer();

    stop = startSync(db);
    await settle();

    expect(paths(requests)).toEqual(['/sync/push', '/sync/push-final', '/sync/push-final', `/media/${PHOTO}`, '/sync/push-final']);
    const finals = requests.filter((request) => request.path === '/sync/push-final').map((request) => request.body as SyncPushFinalRequest);
    expect(finals.map(({ entries, done }) => [entries.length, done])).toEqual([
      [200, false],
      [1, false],
      [0, true],
    ]);

    expect(await getDeviceCredentials()).toBeNull();
    expect(getKv(db, 'device.id')).toBeNull();
    expect(getKv(db, 'device.revoked')).toBeNull();
    expect(getKv(db, 'training.draft')).toBeNull();
    expect(useSession.getState()).toMatchObject({ mode: 'unassigned', deviceId: null, activeUser: null });
    expect(useSyncStatus.getState()).toMatchObject({ replaced: true, lastError: null, pendingCount: 0 });
    // The PIN verifiers do not stay on a phone that is not the site's any more; what was recorded does.
    expect(db.select().from(users).all()).toEqual([]);
    expect(db.select().from(devices).all()).toEqual([]);
    expect(db.select().from(chainEntries).all()).toHaveLength(201);
  });

  it('notices the revocation at the pull too, when nothing waits', async () => {
    const { requests } = revokedServer();
    stop = startSync(db);
    await settle();
    expect(paths(requests)).toEqual(['/sync/pull', '/sync/push-final']);
    expect(useSession.getState().mode).toBe('unassigned');
  });

  it('writes no chain entry once it knows it is revoked, so the upload sees the last one', async () => {
    await writeEntries(1);
    let offline = true;
    revokedServer((request) => (request.path === '/sync/push' ? REVOKED : offline ? new TypeError('Network request failed') : undefined));
    stop = startSync(db);
    await settle();
    expect(getKv(db, 'device.revoked')).toBe(true);

    await expect(appendChainEntry(db, shiftStarted({ shift_id: uuidv7(), guard_id: GUARD, site_id: SITE }), writer)).rejects.toBeInstanceOf(
      ChainWriteError,
    );
    expect(db.select().from(chainEntries).all()).toHaveLength(1);
    offline = false;
  });

  it('goes on after a network failure or a restart, and sends nothing twice', async () => {
    const [first, second] = await writeEntries(2);
    addPhoto();
    let failing = true;
    const { requests } = revokedServer((request) => {
      if (failing && request.path.startsWith('/media/')) return new TypeError('Network request failed');
      return undefined;
    });
    stop = startSync(db);
    await settle();
    expect(paths(requests)).toEqual(['/sync/push', '/sync/push-final', `/media/${PHOTO}`]);
    expect(useSession.getState().mode).toBe('site_phone');
    expect(useSyncStatus.getState().lastError).toMatchObject({ kind: 'network', step: 'media' });

    // The app restarts: the flag is in the database, so it goes straight to the last upload.
    stop();
    failing = false;
    requests.length = 0;
    stop = startSync(db);
    await settle();
    expect(paths(requests)).toEqual([`/media/${PHOTO}`, '/sync/push-final']);
    expect((requests.at(-1)!.body as SyncPushFinalRequest).done).toBe(true);
    expect(useSession.getState().mode).toBe('unassigned');
    expect([first, second].every(Boolean)).toBe(true);
  });

  it('does not close the upload after a push or a photo upload that failed: a later sync sends them first', async () => {
    await writeEntries(1);
    addPhoto();
    let failing: 'push' | 'media' | null = 'push';
    const serverError: FakeAnswer = [500, { error: { code: 'server_error', message: 'Hiba' } }];
    const { requests } = revokedServer((request) => {
      const final = request.path === '/sync/push-final' && !(request.body as SyncPushFinalRequest).done;
      if (failing === 'push' && final) return serverError;
      if (failing === 'media' && request.path.startsWith('/media/')) return serverError;
      return undefined;
    });
    stop = startSync(db);
    await settle();
    // The push failed: the photo still went, but done: true did not.
    expect(paths(requests)).toEqual(['/sync/push', '/sync/push-final', `/media/${PHOTO}`]);
    expect(useSession.getState().mode).toBe('site_phone');
    expect(getKv(db, 'device.revoked')).toBe(true);
    expect(useSyncStatus.getState().lastError).toMatchObject({ kind: 'server', step: 'push' });

    db.update(media).set({ uploaded_at: null }).run();
    failing = 'media';
    requests.length = 0;
    await requestSync('manual');
    await settle();
    expect(paths(requests)).toEqual(['/sync/push-final', `/media/${PHOTO}`]);
    expect(useSession.getState().mode).toBe('site_phone');
    expect(useSyncStatus.getState().lastError).toMatchObject({ kind: 'server', step: 'media' });

    failing = null;
    requests.length = 0;
    await requestSync('manual');
    await settle();
    expect(paths(requests)).toEqual([`/media/${PHOTO}`, '/sync/push-final']);
    expect((requests.at(-1)!.body as SyncPushFinalRequest).done).toBe(true);
    expect(useSession.getState().mode).toBe('unassigned');
  });

  it('closes the upload even if the server rejected entries or refused a photo: the phone cannot fix those', async () => {
    const [entry] = await writeEntries(1);
    addPhoto();
    const { requests } = revokedServer((request) => {
      if (request.path === '/sync/push-final' && !(request.body as SyncPushFinalRequest).done) {
        return {
          server_time: SERVER_TIME,
          accepted: [],
          last_seq: 0,
          rejected: [{ id: entry!.id, code: 'chain_fork', expected_seq: null }],
          media_missing: [],
        };
      }
      if (request.path === '/devices/diagnostics') return { server_time: SERVER_TIME };
      if (request.path.startsWith('/media/')) return [404, { error: { code: 'not_found', message: 'Nincs' } }];
      return undefined;
    });
    stop = startSync(db);
    await settle();
    expect(paths(requests)).toEqual(['/sync/push', '/sync/push-final', '/devices/diagnostics', `/media/${PHOTO}`, '/sync/push-final']);
    expect(useSession.getState().mode).toBe('unassigned');
    // Kept on the phone, but not counted as waiting: nobody can upload them any more.
    expect(db.select().from(chainEntries).all()).toHaveLength(1);
    expect(useSyncStatus.getState().pendingCount).toBe(0);
  });

  it('finishes if the upload turns out to be closed already (a done whose response was lost)', async () => {
    await writeEntries(1);
    setKv(db, 'device.revoked', true);
    const { requests } = revokedServer((request) => (request.path === '/sync/push-final' ? REVOKED : undefined));
    stop = startSync(db);
    await settle();
    expect(paths(requests)).toEqual(['/sync/push-final']);
    expect(useSession.getState().mode).toBe('unassigned');
    expect(await getDeviceCredentials()).toBeNull();
  });

  it('takes the same path after a stop right before the credentials were deleted', async () => {
    const { requests } = revokedServer();
    stop = startSync(db);
    await settle();
    expect(paths(requests).at(-1)).toBe('/sync/push-final');
    await expect(requestSync('manual')).resolves.toEqual({ status: 'skipped' });
  });

  it('does not treat a device_revoked as a revocation on a phone that is not a site phone', async () => {
    setKv(db, 'dev.api_base_url', 'https://waypost.example/api/waypost/v1');
    useSession.setState({ mode: 'supervisor_phone' });
    revokedServer();
    stop = startSync(db);
    await settle();
    expect(getKv(db, 'device.revoked')).toBeNull();
  });
});
