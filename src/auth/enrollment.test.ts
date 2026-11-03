import type { DevicesEnrollResponse } from '@waypost/schema';
import * as SecureStore from 'expo-secure-store';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { getKv, setKv } from '@/db/kv';
import { devices } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';

import { getDeviceCredentials, getSupervisorToken, setSupervisorToken } from '@/device/credentials';
import { enrollmentRequest, saveEnrollment } from './enrollment';
import { loadSession, useSession } from './session';

const EXAMPLES = join(dirname(require.resolve('@waypost/schema/package.json')), 'examples', 'api');
const ENROLLED = JSON.parse(readFileSync(join(EXAMPLES, 'devices-enroll.response/valid/enrolled.json'), 'utf8')) as DevicesEnrollResponse;
const SITE_ID = ENROLLED.device.site_id!;
const store = (SecureStore as unknown as { store: Map<string, string> }).store;

beforeEach(() => {
  store.clear();
  useSession.setState({ mode: null, deviceId: null, activeUser: null });
});

describe('saveEnrollment', () => {
  it('stores the credentials and only this device, and starts the sync state over', async () => {
    const { db } = await createTestDatabase();
    db.insert(devices)
      .values({ ...ENROLLED.device, id: '019a2b3c-4d5e-7f00-8a00-0000000000ff' })
      .run();
    setKv(db, 'sync.cursor', 'old-cursor');
    setKv(db, 'device.revoked', true);
    setKv(db, 'sync.rejected_through_seq', 12);

    await saveEnrollment(db, ENROLLED);

    expect(await getDeviceCredentials()).toEqual({ token: ENROLLED.token, secret: ENROLLED.secret });
    expect(db.select().from(devices).all()).toEqual([ENROLLED.device]);
    expect(getKv(db, 'device.id')).toBe(ENROLLED.device.id);
    // The next pull is a full one.
    expect(getKv(db, 'sync.cursor')).toBeNull();
    // A new chain: nothing of the earlier one holds it back.
    expect(getKv(db, 'device.revoked')).toBeNull();
    expect(getKv(db, 'sync.rejected_through_seq')).toBeNull();
    expect(await loadSession(db)).toBe('site_phone');
  });

  it('asks for this phone with its platform and version', () => {
    expect(enrollmentRequest(SITE_ID)).toEqual({
      site_id: SITE_ID,
      name: expect.any(String),
      platform: expect.stringMatching(/^(ios|android)$/),
      app_version: expect.any(String),
    });
  });
});

describe('loadSession', () => {
  it('is not enrolled on a fresh install', async () => {
    const { db } = await createTestDatabase();
    expect(await loadSession(db)).toBe('unassigned');
    expect(useSession.getState()).toEqual({ mode: 'unassigned', deviceId: null, activeUser: null, shiftStart: null });
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
    await saveEnrollment(db, ENROLLED);
    await setSupervisorToken('1|supervisor');
    expect(await loadSession(db)).toBe('site_phone');
    expect(await getSupervisorToken()).toBeNull();
  });
});
