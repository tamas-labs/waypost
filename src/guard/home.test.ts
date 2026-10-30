import { appendChainEntries } from '@/chain/writer';
import type { Database } from '@/db/database';
import { siteUser, users } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { schedulerStep } from '@/domain/rounds';
import { guardLogin } from '@/domain/shift';
import { GUARD, idSequence, local, ROUTE_A, SITE } from '@/domain/testing';
import type { ClockReading } from '@/time/clock';

import { loadShiftHomeInfo, trustedNowMs } from './home';
import { loadGuardState } from './state';
import { seedSite } from './testing';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('@/sync/runtime', () => ({ notifyChainEntry: jest.fn(), requestSync: jest.fn() }));
jest.mock('./scheduler', () => ({ requestSchedulerStep: jest.fn() }));

const AT = '2026-10-27T12:00:00.000Z';

let db: Database;
let now: string;
const readClock = (): ClockReading => ({ device_time: now, uptime_ms: 1000, boot_id: 'android-boot:12' });
const newId = idSequence();

beforeEach(async () => {
  ({ db } = await createTestDatabase());
  now = local('19:55');
});

async function seedWithGuard() {
  await seedSite(db);
  db.insert(users).values({ id: GUARD, name: 'Nagy Péter', role: 'guard', pin_hash: null, pin_salt: null, pin_iterations: null, active: true, created_at: AT, updated_at: AT }).run();
  db.insert(siteUser).values({ site_id: SITE, user_id: GUARD }).run();
}

it('is null until the site is pulled', () => {
  expect(loadShiftHomeInfo(db, GUARD, readClock)).toBeNull();
});

it('has no home without an open shift', async () => {
  await seedWithGuard();
  expect(loadShiftHomeInfo(db, GUARD, readClock)).toEqual({ site_name: 'Raktár', timezone: 'Europe/Budapest', guard_name: 'Nagy Péter', home: null });
});

it('names the routes and the skipped points of the shift', async () => {
  await seedWithGuard();
  await appendChainEntries(db, guardLogin(loadGuardState(db, now)!, GUARD, now, newId).drafts, { readClock });
  // The app did not run until 20:25: the 20:00 round opened and closed without a scan.
  now = local('20:25');
  await appendChainEntries(db, schedulerStep(loadGuardState(db, now)!, now, newId), { readClock });

  const home = loadShiftHomeInfo(db, GUARD, readClock)!.home!;
  expect(home.rounds[0]).toMatchObject({ route_id: ROUTE_A, route_name: `Útvonal ${ROUTE_A.slice(-2)}`, state: 'missed', missing_names: ['Pont 1', 'Pont 2', 'Pont 3'] });
  expect(home.next_at).toBe(local('20:30'));
});

it('counts with the trusted time', () => {
  expect(trustedNowMs(db, readClock)).toBe(Date.parse(now));
});
