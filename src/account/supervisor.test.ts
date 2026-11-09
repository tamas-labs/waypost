import type { AuthLoginResponse, DevicesEnrollResponse } from '@waypost/schema';
import * as SecureStore from 'expo-secure-store';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { configCalls } from '@/api/config-calls';
import { NetworkError } from '@/api/errors';
import { useSession } from '@/auth/session';
import type { Database } from '@/db/database';
import { getKv, setKv } from '@/db/kv';
import { devices, outbox, routeVersions, sites } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { getDeviceCredentials, getSupervisorToken, setDeviceCredentials, setSupervisorToken } from '@/device/credentials';
import { queueAction } from '@/sync/outbox';
import { whenSyncIdle } from '@/sync/runtime';
import { fakeApi, type FakeAnswer } from '@/sync/testing';
import { useSyncStatus } from '@/sync/status';

import {
  enrollThisPhone,
  finishInterruptedEnrollment,
  OtherAccountError,
  renewSupervisorLogin,
  signInSupervisor,
  signOutSupervisor,
  UnsentActionsError,
  unsentSupervisorActions,
} from './supervisor';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('@/sync/runtime', () => ({ whenSyncIdle: jest.fn(() => Promise.resolve()), refreshPendingCount: jest.fn() }));

const EXAMPLES = join(dirname(require.resolve('@waypost/schema/package.json')), 'examples', 'api');
const LOGGED_IN = JSON.parse(readFileSync(join(EXAMPLES, 'auth-login.response/valid/supervisor.json'), 'utf8')) as AuthLoginResponse;
const SERVER_TIME = { server_time: '2026-10-27T10:05:12.345Z' };
const ENROLLED = JSON.parse(readFileSync(join(EXAMPLES, 'devices-enroll.response/valid/enrolled.json'), 'utf8')) as DevicesEnrollResponse;
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
  setKv(db, 'training.draft', {
    site_id: SITE,
    supervisor_id: LOGGED_IN.user.id,
    route: { id: 'r', name: '', order_mode: 'free' },
    saved_order_mode: null,
    started: { uptime_ms: 0, boot_id: 'android-boot:12' },
    points: [],
  });
}

function expectNoAccountData() {
  expect(db.select().from(sites).all()).toEqual([]);
  expect(db.select().from(routeVersions).all()).toEqual([]);
  expect(db.select().from(outbox).all()).toEqual([]);
  expect(getKv(db, 'sync.cursor')).toBeNull();
  expect(getKv(db, 'sync.last_success_at')).toBeNull();
  expect(getKv(db, 'outbox.rejected')).toBeNull();
  expect(getKv(db, 'supervisor.account')).toBeNull();
  expect(getKv(db, 'training.draft')).toBeNull();
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

describe('renewSupervisorLogin', () => {
  const ACCOUNT = { id: LOGGED_IN.user.id, name: 'Nagy Anna', email: 'nagy.anna@example.com' };

  beforeEach(async () => {
    await setSupervisorToken('elavult-token');
    useSession.setState({ mode: 'supervisor_phone' });
    seedAccountData();
    setKv(db, 'supervisor.account', ACCOUNT);
  });

  it('replaces the token, keeps the account and its waiting actions, and syncs (WP-APP-016)', async () => {
    const syncNow = jest.fn(async () => ({ status: 'done' as const }));
    useSyncStatus.setState({
      syncNow: syncNow as never,
      lastError: { kind: 'unauthenticated', message: 'x', at: SERVER_TIME.server_time } as never,
    });
    const { api, requests } = fakeApi(() => LOGGED_IN);

    await renewSupervisorLogin(db, api, { email: ACCOUNT.email, password: 'titkos-jelszo' });

    expect(requests.map((request) => request.path)).toEqual(['/auth/login']);
    await expect(getSupervisorToken()).resolves.toBe(LOGGED_IN.token);
    expect(db.select().from(outbox).all()).toHaveLength(1);
    expect(db.select().from(sites).all()).toHaveLength(1);
    expect(getKv(db, 'sync.cursor')).toBe('Y3Vyc29yLTE');
    expect(getKv(db, 'supervisor.account')).toEqual({ id: LOGGED_IN.user.id, name: LOGGED_IN.user.name, email: LOGGED_IN.user.email });
    expect(useSyncStatus.getState().lastError).toBeNull();
    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(useSession.getState().mode).toBe('supervisor_phone');
  });

  it("refuses another account's login, logs it out again, and keeps everything", async () => {
    setKv(db, 'supervisor.account', { ...ACCOUNT, id: '019a2b3c-4d5e-7f00-8a00-0000000000ff' });
    const { api, requests } = fakeApi((request) => (request.path === '/auth/login' ? LOGGED_IN : SERVER_TIME));

    const error = await renewSupervisorLogin(db, api, { email: 'masik@example.com', password: 'titkos-jelszo' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(OtherAccountError);
    expect((error as OtherAccountError).accountName).toBe('Nagy Anna');
    expect(requests.map((request) => request.path)).toEqual(['/auth/login', '/auth/logout']);
    expect(requests[1]!.headers.Authorization).toBe(`Bearer ${LOGGED_IN.token}`);
    await expect(getSupervisorToken()).resolves.toBe('elavult-token');
    expect(db.select().from(outbox).all()).toHaveLength(1);
  });

  it('changes nothing when the server refuses the login', async () => {
    const { api } = fakeApi(() => [401, { error: { code: 'unauthenticated', message: 'Hibás e-mail-cím vagy jelszó.' } }]);
    await expect(renewSupervisorLogin(db, api, { email: ACCOUNT.email, password: 'rossz' })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    await expect(getSupervisorToken()).resolves.toBe('elavult-token');
  });

  it("is only for a supervisor's own phone", async () => {
    useSession.setState({ mode: 'site_phone', deviceId: 'd' });
    await expect(renewSupervisorLogin(db, fakeApi(() => LOGGED_IN).api, { email: ACCOUNT.email, password: 'x' })).rejects.toThrow(
      "Not a supervisor's own phone",
    );
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

describe('enrollThisPhone', () => {
  const ENROLL_SITE = ENROLLED.device.site_id!;

  async function onSupervisorPhone() {
    await setSupervisorToken(LOGGED_IN.token);
    useSession.setState({ mode: 'supervisor_phone' });
    seedAccountData();
  }

  /** The enrollment and the logout answer; anything else is a test failure. */
  function enrollApi(enroll: FakeAnswer = ENROLLED) {
    return fakeApi((request) => (request.path === '/devices/enroll' ? enroll : request.path === '/auth/logout' ? SERVER_TIME : [404, {}]));
  }

  /** "Sync now", as the runtime would run it: here it sends the outbox or leaves it. */
  function syncNowSends(sends: boolean) {
    const syncNow = jest.fn(async () => {
      if (sends) db.delete(outbox).run();
      return { status: 'done' as const };
    });
    useSyncStatus.setState({ syncNow: syncNow as never });
    return syncNow;
  }

  it('sends the waiting actions, enrolls, and leaves only the site phone on the phone', async () => {
    await onSupervisorPhone();
    const syncNow = syncNowSends(true);
    const { api, requests } = enrollApi();

    await enrollThisPhone(db, api, ENROLL_SITE);

    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(requests.map((request) => request.path)).toEqual(['/devices/enroll', '/auth/logout']);
    expect(requests[0]!.headers.Authorization).toBe(`Bearer ${LOGGED_IN.token}`);
    expect(requests[0]!.body).toMatchObject({ site_id: ENROLL_SITE });
    expect(requests[1]!.headers.Authorization).toBe(`Bearer ${LOGGED_IN.token}`);
    await expect(getDeviceCredentials()).resolves.toEqual({ token: ENROLLED.token, secret: ENROLLED.secret });
    await expect(getSupervisorToken()).resolves.toBeNull();
    // The account's sites are gone; the site phone's own come with the full pull.
    expect(db.select().from(sites).all()).toEqual([]);
    expect(db.select().from(devices).all()).toEqual([ENROLLED.device]);
    expect(getKv(db, 'device.id')).toBe(ENROLLED.device.id);
    expect(getKv(db, 'supervisor.account')).toBeNull();
    expect(getKv(db, 'sync.cursor')).toBeNull();
    expect(jest.mocked(whenSyncIdle)).toHaveBeenCalled();
    expect(useSession.getState()).toMatchObject({ mode: 'site_phone', deviceId: ENROLLED.device.id, activeUser: null });
  });

  it('stores the enrollment before it waits for the running sync, and records the device again after it (WP-APP-014)', async () => {
    await onSupervisorPhone();
    syncNowSends(true);
    let idle = () => {};
    jest.mocked(whenSyncIdle).mockReturnValueOnce(new Promise((resolve) => (idle = resolve)));

    const enrolled = enrollThisPhone(db, enrollApi().api, ENROLL_SITE);
    while (jest.mocked(whenSyncIdle).mock.calls.length === 0) await new Promise((resolve) => setImmediate(resolve));
    // Were the app stopped here, the secret would be on the phone, with the device.
    await expect(getDeviceCredentials()).resolves.toEqual({ token: ENROLLED.token, secret: ENROLLED.secret });
    expect(getKv(db, 'device.id')).toBe(ENROLLED.device.id);
    // The account's sync, still running, replaces the device list.
    db.delete(devices).run();
    idle();
    await enrolled;

    expect(db.select().from(devices).all()).toEqual([ENROLLED.device]);
    expect(getKv(db, 'sync.confirmed')).not.toBeNull();
    expectNoAccountData();
  });

  it('does not sync first when nothing waits', async () => {
    await setSupervisorToken(LOGGED_IN.token);
    useSession.setState({ mode: 'supervisor_phone' });
    const syncNow = syncNowSends(true);
    await enrollThisPhone(db, enrollApi().api, ENROLL_SITE);
    expect(syncNow).not.toHaveBeenCalled();
    expect(useSession.getState().mode).toBe('site_phone');
  });

  it('changes nothing while actions cannot be sent', async () => {
    await onSupervisorPhone();
    syncNowSends(false);
    const { api, requests } = enrollApi();

    const error = await enrollThisPhone(db, api, ENROLL_SITE).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnsentActionsError);
    expect((error as UnsentActionsError).count).toBe(1);
    expect(requests).toEqual([]);
    await expect(getSupervisorToken()).resolves.toBe(LOGGED_IN.token);
    expect(db.select().from(sites).all()).toHaveLength(1);
    expect(useSession.getState().mode).toBe('supervisor_phone');
  });

  it('changes nothing if the server refuses the enrollment', async () => {
    await onSupervisorPhone();
    syncNowSends(true);
    const { api } = enrollApi([403, { error: { code: 'forbidden', message: 'Ez nem a te telephelyed.' } }]);

    await expect(enrollThisPhone(db, api, ENROLL_SITE)).rejects.toMatchObject({ code: 'forbidden' });

    await expect(getSupervisorToken()).resolves.toBe(LOGGED_IN.token);
    await expect(getDeviceCredentials()).resolves.toBeNull();
    expect(getKv(db, 'device.id')).toBeNull();
    expect(useSession.getState().mode).toBe('supervisor_phone');
  });

  it('is enrolled even if the logout fails', async () => {
    await setSupervisorToken(LOGGED_IN.token);
    useSession.setState({ mode: 'supervisor_phone' });
    const { api } = fakeApi((request) => (request.path === '/devices/enroll' ? ENROLLED : new NetworkError(false)));
    await enrollThisPhone(db, api, ENROLL_SITE);
    expect(useSession.getState().mode).toBe('site_phone');
  });

  it("is only for a supervisor's own phone with its token", async () => {
    const { api, requests } = enrollApi();
    await expect(enrollThisPhone(db, api, ENROLL_SITE)).rejects.toThrow("supervisor's own phone");
    useSession.setState({ mode: 'supervisor_phone' });
    await expect(enrollThisPhone(db, api, ENROLL_SITE)).rejects.toThrow('No supervisor token');
    expect(requests).toEqual([]);
  });
});

describe('finishInterruptedEnrollment', () => {
  it("deletes a supervisor account's data left on a site phone, and keeps the device", async () => {
    seedAccountData();
    db.transaction((tx) => {
      tx.insert(devices).values(ENROLLED.device).run();
      setKv(tx, 'device.id', ENROLLED.device.id);
    });
    const confirmed = [{ ids: [ENROLLED.device.id], server_time: ENROLLED.server_time }];
    setKv(db, 'sync.confirmed', confirmed);
    useSession.setState({ mode: 'site_phone', deviceId: ENROLLED.device.id });

    expect(finishInterruptedEnrollment(db)).toBe(true);

    expectNoAccountData();
    expect(db.select().from(devices).all()).toEqual([ENROLLED.device]);
    expect(getKv(db, 'device.id')).toBe(ENROLLED.device.id);
    expect(getKv(db, 'sync.confirmed')).toEqual(confirmed);
    expect(finishInterruptedEnrollment(db)).toBe(false);
  });

  it("leaves a supervisor's own phone and a site phone without account data alone", () => {
    seedAccountData();
    useSession.setState({ mode: 'supervisor_phone' });
    expect(finishInterruptedEnrollment(db)).toBe(false);
    expect(getKv(db, 'supervisor.account')).not.toBeNull();
  });
});
