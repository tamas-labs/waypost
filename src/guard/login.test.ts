import { pinVectors } from '@waypost/schema/vectors';
import { asc } from 'drizzle-orm';

import { useSession } from '@/auth/session';
import type { Database } from '@/db/database';
import { siteUser, shifts, users } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { GUARD, local, OTHER_GUARD, ROUTE_A, ROUTE_B, SITE } from '@/domain/testing';
import type { ClockReading } from '@/time/clock';

import { loadPinScreenInfo, loadShiftStartInfo, signInWithPin } from './login';
import { requestSchedulerStep } from './scheduler';
import { seedSite } from './testing';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('@/sync/runtime', () => ({ notifyChainEntry: jest.fn(), requestSync: jest.fn() }));
jest.mock('./scheduler', () => ({ requestSchedulerStep: jest.fn() }));

const SUPERVISOR = '019a2b3c-4d5e-7f00-8a00-000000000002';
const vector = (name: string) => pinVectors.cases.find((c) => c.name === name)!;
const AT = '2026-10-27T12:00:00.000Z';

let db: Database;
let now: string;
const readClock = (): ClockReading => ({ device_time: now, uptime_ms: 1000, boot_id: 'android-boot:12' });

function addUser(id: string, name: string, role: 'guard' | 'supervisor', pinCase: string) {
  const { pin_hash, pin_salt, pin_iterations } = vector(pinCase);
  db.insert(users).values({ id, name, role, pin_hash, pin_salt, pin_iterations, active: true, created_at: AT, updated_at: AT }).run();
  db.insert(siteUser).values({ site_id: SITE, user_id: id }).run();
}

const openShifts = () => db.select({ guard_id: shifts.guard_id, closed_by: shifts.closed_by }).from(shifts).orderBy(asc(shifts.started_at)).all();

beforeEach(async () => {
  ({ db } = await createTestDatabase());
  useSession.setState({ mode: 'site_phone', activeUser: null });
  jest.mocked(requestSchedulerStep).mockClear();
  now = local('19:40');
});

describe('the PIN screen information', () => {
  it('is null until the site is pulled', () => {
    expect(loadPinScreenInfo(db, readClock)).toBeNull();
  });

  it('has the site, the guard on shift and the next round', async () => {
    await seedSite(db);
    addUser(GUARD, 'Kovács Péter', 'guard', 'basic');
    expect(loadPinScreenInfo(db, readClock)).toEqual({ site_name: 'Raktár', timezone: 'Europe/Budapest', now, on_shift: null, next_round: { scheduled_at: local('20:00'), starts_shift: true } });

    await signInWithPin(db, vector('basic').pin, readClock);
    now = local('20:10');
    expect(loadPinScreenInfo(db, readClock)).toMatchObject({ on_shift: 'Kovács Péter', next_round: { scheduled_at: local('20:30'), starts_shift: false } });
  });
});

describe('signing in with a PIN', () => {
  beforeEach(async () => {
    await seedSite(db);
    addUser(GUARD, 'Kovács Péter', 'guard', 'basic');
    addUser(OTHER_GUARD, 'Szabó Anna', 'guard', 'all-nines');
    addUser(SUPERVISOR, 'Nagy Éva', 'supervisor', 'leading-zeros');
  });

  it('starts the shift of a guard, then opens the guard mode', async () => {
    const result = await signInWithPin(db, vector('basic').pin, readClock);
    expect(result).toMatchObject({ status: 'ok', role: 'guard', user: { id: GUARD, name: 'Kovács Péter' }, login: { outcome: 'started' } });
    expect(openShifts()).toEqual([{ guard_id: GUARD, closed_by: null }]);
    expect(useSession.getState()).toMatchObject({ activeUser: { id: GUARD, role: 'guard' }, shiftStart: { handover: null } });
    // The rounds due now open at once.
    expect(requestSchedulerStep).toHaveBeenCalledWith('shift_started');
  });

  it('continues the same guard’s shift, and hands over to another guard', async () => {
    await signInWithPin(db, vector('basic').pin, readClock);
    useSession.setState({ activeUser: null });
    now = local('20:05');
    jest.mocked(requestSchedulerStep).mockClear();
    await expect(signInWithPin(db, vector('basic').pin, readClock)).resolves.toMatchObject({ login: { outcome: 'continued' } });
    expect(requestSchedulerStep).not.toHaveBeenCalled();
    // The same guard goes on at the shift home.
    expect(useSession.getState().shiftStart).toBeNull();
    useSession.setState({ activeUser: null });
    await expect(signInWithPin(db, vector('all-nines').pin, readClock)).resolves.toMatchObject({ login: { outcome: 'handover' } });
    expect(openShifts()).toEqual([
      { guard_id: GUARD, closed_by: 'handover' },
      { guard_id: OTHER_GUARD, closed_by: null },
    ]);
    expect(useSession.getState()).toMatchObject({ activeUser: { id: OTHER_GUARD, role: 'guard' }, shiftStart: { handover: { guard_name: 'Kovács Péter', at: now } } });
  });

  it('opens the supervisor mode for a supervisor’s PIN, without touching the shift', async () => {
    await expect(signInWithPin(db, vector('leading-zeros').pin, readClock)).resolves.toEqual({ status: 'ok', role: 'supervisor', user: { id: SUPERVISOR, name: 'Nagy Éva' } });
    expect(openShifts()).toEqual([]);
    expect(useSession.getState().activeUser).toEqual({ id: SUPERVISOR, role: 'supervisor' });
  });

  it('logs nobody in for a wrong PIN', async () => {
    await expect(signInWithPin(db, '000000', readClock)).resolves.toEqual({ status: 'wrong', failures: 1, remaining_ms: 0 });
    expect(useSession.getState().activeUser).toBeNull();
    expect(openShifts()).toEqual([]);
  });
});

describe('the shift start information', () => {
  it('has the guard and the night with its routes by name', async () => {
    await seedSite(db);
    addUser(GUARD, 'Kovács Péter', 'guard', 'basic');
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
