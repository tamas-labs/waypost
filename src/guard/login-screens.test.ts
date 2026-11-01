import { pinVectors } from '@waypost/schema/vectors';

import { useSession } from '@/auth/session';
import type { Database } from '@/db/database';
import { siteUser, users } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { GUARD, local, ROUTE_A, ROUTE_B, SITE } from '@/domain/testing';
import type { ClockReading } from '@/time/clock';

import { signInWithPin } from './login';
import { loadPinScreenInfo, loadShiftStartInfo } from './login-screens';
import { seedSite } from './testing';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('@/sync/runtime', () => ({ requestSync: jest.fn() }));
jest.mock('./scheduler', () => ({ requestSchedulerStep: jest.fn() }));

const AT = '2026-10-27T12:00:00.000Z';
const basic = pinVectors.cases.find((c) => c.name === 'basic')!;

let db: Database;
let now: string;
const readClock = (): ClockReading => ({ device_time: now, uptime_ms: 1000, boot_id: 'android-boot:12' });

function addGuard() {
  const { pin_hash, pin_salt, pin_iterations } = basic;
  db.insert(users)
    .values({
      id: GUARD,
      name: 'Kovács Péter',
      role: 'guard',
      pin_hash,
      pin_salt,
      pin_iterations,
      active: true,
      created_at: AT,
      updated_at: AT,
    })
    .run();
  db.insert(siteUser).values({ site_id: SITE, user_id: GUARD }).run();
}

beforeEach(async () => {
  ({ db } = await createTestDatabase());
  useSession.setState({ mode: 'site_phone', activeUser: null });
  now = local('19:40');
});

describe('the PIN screen information', () => {
  it('is null until the site is pulled', () => {
    expect(loadPinScreenInfo(db, readClock)).toBeNull();
  });

  it('has the site, the guard on shift and the next round', async () => {
    await seedSite(db);
    addGuard();
    expect(loadPinScreenInfo(db, readClock)).toEqual({
      site_name: 'Raktár',
      timezone: 'Europe/Budapest',
      now,
      on_shift: null,
      next_round: { scheduled_at: local('20:00'), starts_shift: true },
    });

    await signInWithPin(db, basic.pin, readClock);
    now = local('20:10');
    expect(loadPinScreenInfo(db, readClock)).toMatchObject({
      on_shift: 'Kovács Péter',
      next_round: { scheduled_at: local('20:30'), starts_shift: false },
    });
  });
});

describe('the shift start information', () => {
  it('has the guard and the night with its routes by name', async () => {
    await seedSite(db);
    addGuard();
    expect(loadShiftStartInfo(db, GUARD, readClock)).toMatchObject({
      timezone: 'Europe/Budapest',
      guard_name: 'Kovács Péter',
      day: {
        first_at: local('20:00'),
        last_at: local('23:00'),
        routes: [
          { route_id: ROUTE_A, name: `Útvonal ${ROUTE_A.slice(-2)}`, checkpoints: 3, rounds: 4 },
          { route_id: ROUTE_B, name: `Útvonal ${ROUTE_B.slice(-2)}`, checkpoints: 2, rounds: 2 },
        ],
      },
    });
  });
});
