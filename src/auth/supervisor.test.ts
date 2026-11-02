import type { AuthLoginResponse } from '@waypost/schema';
import * as SecureStore from 'expo-secure-store';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { configCalls } from '@/api/config-calls';
import { NetworkError } from '@/api/errors';
import type { Database } from '@/db/database';
import { getKv, setKv } from '@/db/kv';
import { outbox, routeVersions, sites } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { setDeviceCredentials, getSupervisorToken, setSupervisorToken } from '@/device/credentials';
import { queueAction } from '@/sync/outbox';
import { whenSyncIdle } from '@/sync/runtime';
import { fakeApi, type FakeAnswer } from '@/sync/testing';
import { useSyncStatus } from '@/sync/status';

import { useSession } from './session';
import { signInSupervisor, signOutSupervisor, unsentSupervisorActions } from './supervisor';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('@/sync/runtime', () => ({ whenSyncIdle: jest.fn(() => Promise.resolve()), refreshPendingCount: jest.fn() }));

const EXAMPLES = join(dirname(require.resolve('@waypost/schema/package.json')), 'examples', 'api');
const LOGGED_IN = JSON.parse(readFileSync(join(EXAMPLES, 'auth-login.response/valid/supervisor.json'), 'utf8')) as AuthLoginResponse;
const SERVER_TIME = { server_time: '2026-10-27T10:05:12.345Z' };
const store = (SecureStore as unknown as { store: Map<string, string> }).store;
const SITE = '019a2b3c-4d5e-7f00-8a00-000000000001';

let db: Database;

beforeEach(async () => {
  jest.mocked(whenSyncIdle).mockClear();
  store.clear();
  ({ db } = await createTestDatabase());
  useSession.setState({ mode: 'unassigned', deviceId: null, activeUser: null, shiftStart: null });
  useSyncStatus.setState({ online: true, rejectedCalls: [], lastSuccessAt: null, lastError: null });
});

/** What a supervisor's own phone keeps of the account. */
function seedAccountData() {
  db.insert(sites)
    .values({
      id: SITE,
      name: 'Raktár',
      timezone: 'Europe/Budapest',
      no_data_alert_after_min: 120,
      created_by: LOGGED_IN.user.id,
      created_at: SERVER_TIME.server_time,
      updated_at: SERVER_TIME.server_time,
    })
    .run();
  db.insert(routeVersions)
    .values({ id: '019a2b3c-4d5e-7f00-8a00-000000000008', route_id: 'r', version: 1, created_by: 'u', created_at: SERVER_TIME.server_time })
    .run();
  queueAction(db, { calls: [configCalls.deleteSite(SITE)] }, null);
  setKv(db, 'sync.cursor', 'Y3Vyc29yLTE');
  setKv(db, 'sync.last_success_at', SERVER_TIME.server_time);
  setKv(db, 'outbox.rejected', []);
  setKv(db, 'supervisor.account', { id: LOGGED_IN.user.id, name: 'Előző supervisor', email: null });
}

function expectNoAccountData() {
  expect(db.select().from(sites).all()).toEqual([]);
  expect(db.select().from(routeVersions).all()).toEqual([]);
  expect(db.select().from(outbox).all()).toEqual([]);
  expect(getKv(db, 'sync.cursor')).toBeNull();
  expect(getKv(db, 'sync.last_success_at')).toBeNull();
  expect(getKv(db, 'outbox.rejected')).toBeNull();
  expect(getKv(db, 'supervisor.account')).toBeNull();
}

describe('signInSupervisor', () => {
  it("logs in with the phone's name, stores the token and makes the phone the supervisor's own", async () => {
    seedAccountData();
    useSyncStatus.setState({ replaced: true });
    const { api, requests } = fakeApi(() => LOGGED_IN);

    await signInSupervisor(db, api, { email: 'nagy.anna@example.com', password: 'titkos-jelszo' });

    expect(requests).toEqual([
      expect.objectContaining({
        method: 'POST',
        path: '/auth/login',
        body: { email: 'nagy.anna@example.com', password: 'titkos-jelszo', device_name: expect.any(String) },
      }),
    ]);
    expect(requests[0]!.headers).not.toHaveProperty('Authorization');
    await expect(getSupervisorToken()).resolves.toBe(LOGGED_IN.token);
    expect(useSession.getState()).toMatchObject({ mode: 'supervisor_phone', deviceId: null, activeUser: null });
    // Left over by an interrupted logout: the first pull is a full one.
    expect(db.select().from(sites).all()).toEqual([]);
    expect(getKv(db, 'sync.cursor')).toBeNull();
    // Whose phone it is: the account button and a new site's created_by.
    expect(getKv(db, 'supervisor.account')).toEqual({ id: LOGGED_IN.user.id, name: LOGGED_IN.user.name, email: LOGGED_IN.user.email });
    // The login screen no longer tells that the phone was replaced.
    expect(useSyncStatus.getState().replaced).toBe(false);
  });

  it('stores nothing when the server refuses the login', async () => {
    const { api } = fakeApi(() => [401, { error: { code: 'unauthenticated', message: 'Hibás e-mail-cím vagy jelszó.' } }]);

    await expect(signInSupervisor(db, api, { email: 'nagy.anna@example.com', password: 'rossz' })).rejects.toMatchObject({
      code: 'unauthenticated',
      message: 'Hibás e-mail-cím vagy jelszó.',
    });

    await expect(getSupervisorToken()).resolves.toBeNull();
    expect(useSession.getState().mode).toBe('unassigned');
  });

  it('is only for a phone that is not enrolled', async () => {
    useSession.setState({ mode: 'site_phone', deviceId: 'd' });
    const { api, requests } = fakeApi(() => LOGGED_IN);
    await expect(signInSupervisor(db, api, { email: 'a@example.com', password: 'titkos-jelszo' })).rejects.toThrow('not enrolled');
    expect(requests).toEqual([]);
  });
});

describe('signOutSupervisor', () => {
  async function onSupervisorPhone() {
    await setSupervisorToken(LOGGED_IN.token);
    useSession.setState({ mode: 'supervisor_phone' });
    seedAccountData();
  }

  it('deletes the token on the server and the phone, and everything of the account, after the running sync', async () => {
    await onSupervisorPhone();
    expect(unsentSupervisorActions(db)).toBe(1);
    let idle!: () => void;
    jest.mocked(whenSyncIdle).mockReturnValueOnce(new Promise((resolve) => (idle = resolve)));
    const { api, requests } = fakeApi(() => SERVER_TIME);

    const signingOut = signOutSupervisor(db, api);
    while (jest.mocked(whenSyncIdle).mock.calls.length === 0) await new Promise((resolve) => setImmediate(resolve));
    // A sync still runs: nothing is deleted under it, but the token is gone, so no new one starts.
    await expect(getSupervisorToken()).resolves.toBeNull();
    expect(db.select().from(sites).all()).toHaveLength(1);
    idle();
    await signingOut;

    expect(requests).toEqual([expect.objectContaining({ method: 'POST', path: '/auth/logout' })]);
    expect(requests[0]!.headers.Authorization).toBe(`Bearer ${LOGGED_IN.token}`);
    expectNoAccountData();
    expect(unsentSupervisorActions(db)).toBe(0);
    expect(useSession.getState().mode).toBe('unassigned');
  });

  it.each<[string, FakeAnswer]>([
    ['the server cannot be reached', new NetworkError(false)],
    ['the token is not accepted any more', [401, { error: { code: 'unauthenticated', message: 'Nem vagy bejelentkezve.' } }]],
  ])('logs out on the phone even if %s', async (_name, answer) => {
    await onSupervisorPhone();
    const { api } = fakeApi(() => answer);
    await signOutSupervisor(db, api);
    await expect(getSupervisorToken()).resolves.toBeNull();
    expectNoAccountData();
    expect(useSession.getState().mode).toBe('unassigned');
  });

  it('does not call the server offline, or without an API address', async () => {
    await onSupervisorPhone();
    useSyncStatus.setState({ online: false });
    const { api, requests } = fakeApi(() => SERVER_TIME);
    await signOutSupervisor(db, api);
    expect(requests).toEqual([]);

    await onSupervisorPhone();
    useSyncStatus.setState({ online: true });
    await signOutSupervisor(db, null);
    expect(useSession.getState().mode).toBe('unassigned');
  });

  it("is only for a supervisor's own phone", async () => {
    await setDeviceCredentials({ token: 'device-token', secret: `${'A'.repeat(43)}=` });
    useSession.setState({ mode: 'site_phone', deviceId: 'd' });
    await expect(signOutSupervisor(db, null)).rejects.toThrow("Not a supervisor's own phone");
  });
});
