import type { DevicesEnrollResponse } from '@waypost/schema';
import * as SecureStore from 'expo-secure-store';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { createApiClient } from '@/api/client';
import { isApiError } from '@/api/errors';
import { getKv, setKv } from '@/db/kv';
import { devices } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';

import { getDeviceCredentials, getSupervisorToken, setSupervisorToken } from './credentials';
import { enrollThisPhone } from './enrollment';
import { loadSession, useSession } from './session';

const EXAMPLES = join(dirname(require.resolve('@waypost/schema/package.json')), 'examples', 'api');
const ENROLLED = JSON.parse(readFileSync(join(EXAMPLES, 'devices-enroll.response/valid/enrolled.json'), 'utf8')) as DevicesEnrollResponse;
const SITE_ID = ENROLLED.device.site_id!;
const BASE_URL = 'https://waypost.example/api/waypost/v1';
const store = (SecureStore as unknown as { store: Map<string, string> }).store;

/** A fake API answering the enrollment and the logout. */
function fakeApi({ logoutFails = false, enrollStatus = 200 } = {}) {
  const fetchMock = jest.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
    const path = String(url).slice(BASE_URL.length);
    if (path === '/devices/enroll') {
      return enrollStatus === 200
        ? Response.json(ENROLLED)
        : Response.json({ server_time: ENROLLED.server_time, error: { code: 'forbidden', message: 'Nincs jogosultságod.' } }, { status: enrollStatus });
    }
    if (path === '/auth/logout') {
      if (logoutFails) throw new TypeError('Network request failed');
      return Response.json({ server_time: ENROLLED.server_time });
    }
    return new Response('', { status: 404 });
  });
  return { api: createApiClient({ baseUrl: BASE_URL, fetch: fetchMock }), fetchMock };
}

beforeEach(() => {
  store.clear();
  useSession.setState({ mode: null, deviceId: null, activeUser: null });
});

describe('enrollThisPhone', () => {
  it('stores the credentials and the device, logs the supervisor out and becomes the site phone', async () => {
    const { db } = await createTestDatabase();
    setKv(db, 'sync.cursor', 'old-cursor');
    await setSupervisorToken('1|supervisor');
    const { api, fetchMock } = fakeApi();

    await enrollThisPhone(db, api, '1|supervisor', SITE_ID);

    const [enrollUrl, enrollInit] = fetchMock.mock.calls[0]!;
    expect(String(enrollUrl)).toBe(`${BASE_URL}/devices/enroll`);
    expect(JSON.parse(enrollInit!.body as string)).toMatchObject({ site_id: SITE_ID, platform: expect.stringMatching(/^(ios|android)$/) });
    expect(String(fetchMock.mock.calls[1]![0])).toBe(`${BASE_URL}/auth/logout`);

    expect(await getDeviceCredentials()).toEqual({ token: ENROLLED.token, secret: ENROLLED.secret });
    expect(await getSupervisorToken()).toBeNull();
    expect(db.select().from(devices).all()).toEqual([ENROLLED.device]);
    expect(getKv(db, 'device.id')).toBe(ENROLLED.device.id);
    // The next pull is a full one.
    expect(getKv(db, 'sync.cursor')).toBeNull();
    expect(useSession.getState()).toMatchObject({ mode: 'site_phone', deviceId: ENROLLED.device.id });
  });

  it('is enrolled even if the logout fails', async () => {
    const { db } = await createTestDatabase();
    await enrollThisPhone(db, fakeApi({ logoutFails: true }).api, '1|supervisor', SITE_ID);
    expect(useSession.getState().mode).toBe('site_phone');
  });

  it('changes nothing if the server refuses', async () => {
    const { db } = await createTestDatabase();
    await setSupervisorToken('1|supervisor');
    const error = await enrollThisPhone(db, fakeApi({ enrollStatus: 403 }).api, '1|supervisor', SITE_ID).catch((e: unknown) => e);
    expect(isApiError(error, 'forbidden')).toBe(true);
    expect(await getDeviceCredentials()).toBeNull();
    expect(await getSupervisorToken()).toBe('1|supervisor');
    expect(getKv(db, 'device.id')).toBeNull();
  });
});

describe('loadSession', () => {
  it('is not enrolled on a fresh install', async () => {
    const { db } = await createTestDatabase();
    expect(await loadSession(db)).toBe('unassigned');
    expect(useSession.getState()).toEqual({ mode: 'unassigned', deviceId: null, activeUser: null });
  });

  it("is a supervisor's own phone with a stored supervisor token", async () => {
    const { db } = await createTestDatabase();
    await setSupervisorToken('1|supervisor');
    expect(await loadSession(db)).toBe('supervisor_phone');
  });

  it('deletes device credentials the database does not know (left by an earlier installation)', async () => {
    const { db } = await createTestDatabase();
    store.set('waypost.device_token', ENROLLED.token);
    store.set('waypost.device_secret', ENROLLED.secret);
    expect(await loadSession(db)).toBe('unassigned');
    expect(store.size).toBe(0);
  });

  it('deletes a supervisor token left on the site phone', async () => {
    const { db } = await createTestDatabase();
    await enrollThisPhone(db, fakeApi().api, '1|supervisor', SITE_ID);
    await setSupervisorToken('1|supervisor');
    expect(await loadSession(db)).toBe('site_phone');
    expect(await getSupervisorToken()).toBeNull();
  });
});
