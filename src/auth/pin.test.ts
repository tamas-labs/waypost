import { pinVectors } from '@waypost/schema/vectors';

import type { Database } from '@/db/database';
import { getKv, setKv } from '@/db/kv';
import { devices, siteUser, users } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { FIRST_LOCK_MS } from '@/domain/pin-lockout';
import type { ClockReading } from '@/time/clock';

import { pinHash, pinLockRemaining, pinLogin } from './pin';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));

const SITE = '019a2b3c-4d5e-7f00-8a00-000000000001';
const OTHER_SITE = '019a2b3c-4d5e-7f00-8a00-000000000012';
const DEVICE = '019a2b3c-4d5e-7f00-8a00-000000000004';
const GUARD = '019a2b3c-4d5e-7f00-8a00-000000000003';
const SUPERVISOR = '019a2b3c-4d5e-7f00-8a00-000000000002';
const INACTIVE = '019a2b3c-4d5e-7f00-8a00-000000000013';
const ELSEWHERE = '019a2b3c-4d5e-7f00-8a00-000000000014';
const NO_PIN = '019a2b3c-4d5e-7f00-8a00-000000000015';

const vector = (name: string) => pinVectors.cases.find((c) => c.name === name)!;
const AT = '2026-10-27T20:00:00.000Z';

let db: Database;
let clock: ClockReading;
const readClock = () => clock;

function addUser(id: string, role: 'guard' | 'supervisor', pin: { pin_hash: string; pin_salt: string; pin_iterations: number } | null, site: string, active = true) {
  db.insert(users)
    .values({ id, name: `User ${id.slice(-2)}`, role, pin_hash: pin?.pin_hash ?? null, pin_salt: pin?.pin_salt ?? null, pin_iterations: pin?.pin_iterations ?? null, active, created_at: AT, updated_at: AT })
    .run();
  db.insert(siteUser).values({ site_id: site, user_id: id }).run();
}

beforeEach(async () => {
  ({ db } = await createTestDatabase());
  clock = { device_time: AT, uptime_ms: 1_000_000, boot_id: 'android-boot:12' };
  setKv(db, 'device.id', DEVICE);
  db.insert(devices).values({ id: DEVICE, site_id: SITE, name: 'Porta', platform: 'android', app_version: '0.1.0', enrolled_by: SUPERVISOR, enrolled_at: AT }).run();
  addUser(GUARD, 'guard', vector('basic'), SITE);
  addUser(SUPERVISOR, 'supervisor', vector('leading-zeros'), SITE);
  addUser(INACTIVE, 'guard', vector('all-zeros'), SITE, false);
  addUser(ELSEWHERE, 'guard', vector('all-nines'), OTHER_SITE);
  addUser(NO_PIN, 'supervisor', null, SITE);
});

describe('PIN hash', () => {
  it.each(pinVectors.cases.map((c) => [c.name, c] as const))('matches the shared vector %s', async (_name, c) => {
    await expect(pinHash(c.pin, c.pin_salt, c.pin_iterations)).resolves.toBe(c.pin_hash);
  });

  it.each(pinVectors.mismatches.map((c) => [c.name, c] as const))('does not match for %s', async (_name, c) => {
    await expect(pinHash(c.pin, c.pin_salt, c.pin_iterations)).resolves.not.toBe(c.pin_hash);
  });

  it('refuses what is not a PIN', async () => {
    for (const pin of pinVectors.malformed_pins) await expect(pinHash(pin, vector('basic').pin_salt, 1)).rejects.toThrow('A PIN is 6 digits');
    await expect(pinLogin(db, '12345', readClock)).rejects.toThrow('A PIN is 6 digits');
  });
});

describe('PIN login', () => {
  it('finds the guard or the supervisor of the site by the PIN', async () => {
    await expect(pinLogin(db, '123456', readClock)).resolves.toEqual({ status: 'ok', user: { id: GUARD, name: 'User 03', role: 'guard' } });
    await expect(pinLogin(db, '001234', readClock)).resolves.toEqual({ status: 'ok', user: { id: SUPERVISOR, name: 'User 02', role: 'supervisor' } });
  });

  it('does not let in an inactive user or a user of another site', async () => {
    await expect(pinLogin(db, '000000', readClock)).resolves.toEqual({ status: 'wrong', failures: 1, remaining_ms: 0 });
    await expect(pinLogin(db, '999999', readClock)).resolves.toEqual({ status: 'wrong', failures: 2, remaining_ms: 0 });
  });

  it('locks after 5 wrong PINs, refuses even the right PIN while locked, and doubles the next lock', async () => {
    for (let i = 1; i <= 4; i++) await expect(pinLogin(db, '654321', readClock)).resolves.toEqual({ status: 'wrong', failures: i, remaining_ms: 0 });
    await expect(pinLogin(db, '654321', readClock)).resolves.toEqual({ status: 'wrong', failures: 5, remaining_ms: FIRST_LOCK_MS });

    clock = { ...clock, uptime_ms: clock.uptime_ms + 60_000 };
    await expect(pinLogin(db, '123456', readClock)).resolves.toEqual({ status: 'locked', remaining_ms: FIRST_LOCK_MS - 60_000 });
    expect(pinLockRemaining(db, readClock)).toBe(FIRST_LOCK_MS - 60_000);

    clock = { ...clock, uptime_ms: clock.uptime_ms + FIRST_LOCK_MS };
    expect(pinLockRemaining(db, readClock)).toBe(0);
    await expect(pinLogin(db, '654321', readClock)).resolves.toEqual({ status: 'wrong', failures: 6, remaining_ms: 2 * FIRST_LOCK_MS });
  });

  it('keeps the lock over a restart, and a right PIN after it resets the counter', async () => {
    for (let i = 0; i < 5; i++) await pinLogin(db, '654321', readClock);
    clock = { device_time: AT, uptime_ms: 30_000, boot_id: 'android-boot:13' };
    await expect(pinLogin(db, '123456', readClock)).resolves.toEqual({ status: 'locked', remaining_ms: FIRST_LOCK_MS });
    expect(getKv(db, 'pin.lockout')).toMatchObject({ failures: 5, lock: { started_uptime_ms: 30_000, boot_id: 'android-boot:13' } });

    clock = { ...clock, uptime_ms: 30_000 + FIRST_LOCK_MS };
    await expect(pinLogin(db, '123456', readClock)).resolves.toMatchObject({ status: 'ok' });
    expect(getKv(db, 'pin.lockout')).toEqual({ failures: 0, lock: null });
  });

  it('needs a phone assigned to a site', async () => {
    db.delete(devices).run();
    await expect(pinLogin(db, '123456', readClock)).rejects.toThrow('The phone is not assigned to a site');
  });
});
