import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';

import { emitChainEntries } from '@/chain/events';
import { createApiClient } from '@/api/client';
import { configCalls } from '@/api/config-calls';
import { ApiError } from '@/api/errors';
import { deleteDeviceCredentials, deleteSupervisorToken, setDeviceCredentials, setSupervisorToken } from '@/device/credentials';
import { useSession } from '@/auth/session';
import type { Database } from '@/db/database';
import { deleteKv, getKv, setKv } from '@/db/kv';
import { outbox } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';

import * as cleanup from './cleanup';
import { queueAction } from './outbox';
import { FOREGROUND_SYNC_INTERVAL_MS, requestSync, startSync, syncContext, syncSteps, type SyncContext } from './runtime';
import { useSyncStatus } from './status';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));

const BASE_URL = 'https://waypost.example/api/waypost/v1';

let appStateListener: (state: AppStateStatus) => void;
let netInfoListener: (state: NetInfoState) => void;
const removeAppState = jest.fn();
const unsubscribeNetInfo = jest.fn();

const network = (isConnected: boolean) =>
  ({ type: isConnected ? 'wifi' : 'none', isConnected, isInternetReachable: isConnected, details: null }) as NetInfoState;

let db: Database;
let stop: () => void;
let pulls: SyncContext[];

beforeEach(async () => {
  jest.useFakeTimers({ now: Date.UTC(2026, 9, 27, 20, 0, 0) });
  ({ db } = await createTestDatabase());
  setKv(db, 'dev.api_base_url', BASE_URL);
  setKv(db, 'device.id', 'd');
  pulls = [];
  jest.spyOn(syncSteps, 'pull').mockImplementation(async (context) => {
    pulls.push(context);
  });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as typeof appStateListener;
    return { remove: removeAppState };
  });
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  jest.mocked(NetInfo.addEventListener).mockImplementation((listener) => {
    netInfoListener = listener;
    return unsubscribeNetInfo;
  });
  await setDeviceCredentials({ token: 'device-token', secret: `${'A'.repeat(43)}=` });
  useSession.setState({ mode: 'site_phone', deviceId: 'd', activeUser: null });
  useSyncStatus.setState({ online: null, running: false, pendingCount: 0, lastSuccessAt: null, lastError: null });
});

afterEach(() => {
  stop();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

/** Lets the promises of a sync settle. */
const settle = () => jest.advanceTimersByTimeAsync(0);

describe('sync runtime', () => {
  it('syncs at start with the device token on the site phone, and records the success', async () => {
    stop = startSync(db);
    await settle();
    expect(pulls).toHaveLength(1);
    expect(pulls[0]).toMatchObject({ token: 'device-token', mode: 'site_phone' });
    expect(pulls[0]!.api.baseUrl).toBe(BASE_URL);
    expect(useSyncStatus.getState()).toMatchObject({ running: false, lastSuccessAt: '2026-10-27T20:00:00.000Z', lastError: null });
    expect(getKv(db, 'sync.last_success_at')).toBe('2026-10-27T20:00:00.000Z');
  });

  it('uses the supervisor token on the supervisor phone, and does not sync a phone that is not enrolled', async () => {
    useSession.setState({ mode: 'unassigned', deviceId: null });
    stop = startSync(db);
    await settle();
    expect(pulls).toHaveLength(0);

    await setSupervisorToken('supervisor-token');
    useSession.setState({ mode: 'supervisor_phone' });
    await settle();
    expect(pulls.map((context) => [context.mode, context.token])).toEqual([['supervisor_phone', 'supervisor-token']]);
  });

  it('records a failed sync as the last error', async () => {
    jest.mocked(syncSteps.pull).mockRejectedValue(new ApiError(503, 'server_error', 'Karbantartás.'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    stop = startSync(db);
    await settle();
    expect(warn).toHaveBeenCalledWith('Sync failed at pull', expect.any(ApiError));
    expect(useSyncStatus.getState().lastError).toEqual({
      kind: 'server',
      step: 'pull',
      message: 'Karbantartás.',
      at: '2026-10-27T20:00:00.000Z',
    });
    expect(useSyncStatus.getState().lastSuccessAt).toBeNull();
  });

  it('tells a failure that is not an Error too', async () => {
    jest.mocked(syncSteps.pull).mockRejectedValue('no route');
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    stop = startSync(db);
    await settle();
    expect(useSyncStatus.getState().lastError).toMatchObject({ step: 'pull', message: 'no route' });
  });

  it('has no context without an API address or a token', async () => {
    stop = () => {};
    expect(await syncContext(db)).toMatchObject({ token: 'device-token' });
    deleteKv(db, 'device.id');
    expect(await syncContext(db)).toBeNull();
    setKv(db, 'device.id', 'd');
    await deleteDeviceCredentials();
    expect(await syncContext(db)).toBeNull();
    useSession.setState({ mode: 'supervisor_phone' });
    await deleteSupervisorToken();
    expect(await syncContext(db)).toBeNull();
    await setSupervisorToken('supervisor-token');
    expect(await syncContext(db)).toMatchObject({ token: 'supervisor-token', mode: 'supervisor_phone' });
    deleteKv(db, 'dev.api_base_url');
    expect(await syncContext(db)).toBeNull();
  });

  it('runs the local cleanup after a good sync, and a failing one does not hurt', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(cleanup, 'cleanUpIfDue').mockImplementation(() => {
      throw new Error('disk full');
    });
    stop = startSync(db);
    await settle();
    expect(cleanup.cleanUpIfDue).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith('The local cleanup failed', expect.any(Error));
    expect(useSyncStatus.getState().lastError).toBeNull();
  });

  it('does not clean up after a failed sync', async () => {
    jest.spyOn(cleanup, 'cleanUpIfDue').mockImplementation(() => {});
    jest.mocked(syncSteps.pull).mockRejectedValue(new ApiError(503, 'server_error', 'Karbantartás.'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    stop = startSync(db);
    await settle();
    expect(cleanup.cleanUpIfDue).not.toHaveBeenCalled();
  });

  it('does not sync for what does not matter: the same app state, or a session with the same mode', async () => {
    stop = startSync(db);
    await settle();
    appStateListener('active');
    useSession.setState({ activeUser: { id: 'u', role: 'guard' } });
    await settle();
    expect(pulls).toHaveLength(1);
  });

  it('starts the interval only in the foreground', async () => {
    Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });
    stop = startSync(db);
    await settle();
    await jest.advanceTimersByTimeAsync(FOREGROUND_SYNC_INTERVAL_MS);
    expect(pulls).toHaveLength(1);
  });

  it('syncs when the network comes back, and tracks online/offline', async () => {
    stop = startSync(db);
    await settle();
    netInfoListener(network(true));
    await settle();
    expect(pulls).toHaveLength(1);

    netInfoListener(network(false));
    expect(useSyncStatus.getState().online).toBe(false);
    netInfoListener(network(true));
    await settle();
    expect(useSyncStatus.getState().online).toBe(true);
    expect(pulls).toHaveLength(2);
  });

  it('syncs when the app comes to the foreground, and every 5 minutes only while it is there', async () => {
    stop = startSync(db);
    await settle();
    await jest.advanceTimersByTimeAsync(FOREGROUND_SYNC_INTERVAL_MS);
    expect(pulls).toHaveLength(2);

    appStateListener('background');
    await jest.advanceTimersByTimeAsync(3 * FOREGROUND_SYNC_INTERVAL_MS);
    expect(pulls).toHaveLength(2);

    appStateListener('active');
    await settle();
    expect(pulls).toHaveLength(3);
    await jest.advanceTimersByTimeAsync(FOREGROUND_SYNC_INTERVAL_MS);
    expect(pulls).toHaveLength(4);
  });

  it('syncs 2 s after a chain entry, and on request', async () => {
    stop = startSync(db);
    await settle();
    emitChainEntries([]);
    emitChainEntries([]);
    await jest.advanceTimersByTimeAsync(2000);
    expect(pulls).toHaveLength(2);
    await expect(requestSync('shift_closed')).resolves.toEqual({ status: 'ok' });
    await expect(useSyncStatus.getState().syncNow()).resolves.toEqual({ status: 'ok' });
    expect(pulls).toHaveLength(4);
  });

  it('syncs 2 s after a supervisor action, and counts its calls as waiting', async () => {
    jest.spyOn(syncSteps, 'outbox').mockResolvedValue();
    stop = startSync(db);
    await settle();
    queueAction(db, { calls: [configCalls.deleteCheckpoint('019a2b3c-4d5e-7f00-8a00-000000000005')] }, 'supervisor');
    expect(useSyncStatus.getState().pendingCount).toBe(1);
    await jest.advanceTimersByTimeAsync(1999);
    expect(pulls).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(pulls).toHaveLength(2);
  });

  it('sends the waiting calls at once when the network comes back, and on Sync now', async () => {
    jest.spyOn(syncSteps, 'outbox').mockResolvedValue();
    const later = () => db.update(outbox).set({ next_attempt_at: '2026-10-27T20:10:00.000Z' }).run();
    const nextAttempt = () => db.select({ at: outbox.next_attempt_at }).from(outbox).get()?.at;
    stop = startSync(db);
    await settle();
    queueAction(db, { calls: [configCalls.deleteCheckpoint('019a2b3c-4d5e-7f00-8a00-000000000005')] }, null);
    later();

    netInfoListener(network(false));
    netInfoListener(network(true));
    expect(nextAttempt()).toBeNull();

    later();
    await useSyncStatus.getState().syncNow();
    expect(nextAttempt()).toBeNull();
  });

  it('sends the outbox with the sync token, and not from a revoked phone', async () => {
    queueAction(db, { calls: [configCalls.deleteCheckpoint('019a2b3c-4d5e-7f00-8a00-000000000005')] }, 'supervisor');
    const fetchMock = jest.fn(async () => new Response(JSON.stringify({ server_time: '2026-10-27T20:00:00.000Z' }), { status: 200 }));
    const context: SyncContext = {
      db,
      api: createApiClient({ baseUrl: BASE_URL, fetch: fetchMock, validate: true }),
      token: 'device-token',
      mode: 'site_phone',
      deviceId: 'd',
      revoked: true,
      mediaMissing: new Set(),
    };

    await syncSteps.outbox(context);
    expect(fetchMock).not.toHaveBeenCalled();

    await syncSteps.outbox({ ...context, revoked: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(db.select().from(outbox).all()).toEqual([]);
  });

  it('stops every trigger', async () => {
    stop = startSync(db);
    await settle();
    stop();
    expect(removeAppState).toHaveBeenCalled();
    expect(unsubscribeNetInfo).toHaveBeenCalled();
    useSession.setState({ mode: 'unassigned' });
    useSession.setState({ mode: 'site_phone' });
    emitChainEntries([]);
    await jest.advanceTimersByTimeAsync(FOREGROUND_SYNC_INTERVAL_MS);
    await expect(requestSync('manual')).resolves.toEqual({ status: 'skipped' });
    expect(pulls).toHaveLength(1);
  });
});
