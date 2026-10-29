import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';

import { ApiError } from '@/api/errors';
import { setDeviceCredentials, setSupervisorToken } from '@/auth/credentials';
import { useSession } from '@/auth/session';
import type { Database } from '@/db/database';
import { getKv, setKv } from '@/db/kv';
import { createTestDatabase } from '@/db/testing';

import { FOREGROUND_SYNC_INTERVAL_MS, notifyChainEntry, requestSync, startSync, syncSteps, type SyncContext } from './runtime';
import { useSyncStatus } from './status';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));

const BASE_URL = 'https://waypost.example/api/waypost/v1';

let appStateListener: (state: AppStateStatus) => void;
let netInfoListener: (state: NetInfoState) => void;
const removeAppState = jest.fn();
const unsubscribeNetInfo = jest.fn();

const network = (isConnected: boolean) => ({ type: isConnected ? 'wifi' : 'none', isConnected, isInternetReachable: isConnected, details: null }) as NetInfoState;

let db: Database;
let stop: () => void;
let pulls: SyncContext[];

beforeEach(async () => {
  jest.useFakeTimers({ now: Date.UTC(2026, 9, 27, 20, 0, 0) });
  ({ db } = await createTestDatabase());
  setKv(db, 'dev.api_base_url', BASE_URL);
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
    jest.mocked(syncSteps.pull).mockRejectedValue(new ApiError(401, 'device_revoked', 'A telefont visszavonták.'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    stop = startSync(db);
    await settle();
    expect(warn).toHaveBeenCalledWith('Sync failed at pull', expect.any(ApiError));
    expect(useSyncStatus.getState().lastError).toEqual({ kind: 'device_revoked', step: 'pull', message: 'A telefont visszavonták.', at: '2026-10-27T20:00:00.000Z' });
    expect(useSyncStatus.getState().lastSuccessAt).toBeNull();
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
    notifyChainEntry();
    notifyChainEntry();
    await jest.advanceTimersByTimeAsync(2000);
    expect(pulls).toHaveLength(2);
    await expect(requestSync('shift_closed')).resolves.toEqual({ status: 'ok' });
    await expect(useSyncStatus.getState().syncNow()).resolves.toEqual({ status: 'ok' });
    expect(pulls).toHaveLength(4);
  });

  it('stops every trigger', async () => {
    stop = startSync(db);
    await settle();
    stop();
    expect(removeAppState).toHaveBeenCalled();
    expect(unsubscribeNetInfo).toHaveBeenCalled();
    useSession.setState({ mode: 'unassigned' });
    useSession.setState({ mode: 'site_phone' });
    await jest.advanceTimersByTimeAsync(FOREGROUND_SYNC_INTERVAL_MS);
    await expect(requestSync('manual')).resolves.toEqual({ status: 'skipped' });
    expect(pulls).toHaveLength(1);
  });
});
