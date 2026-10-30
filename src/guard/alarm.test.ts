import { appendChainEntries } from '@/chain/writer';
import type { Database } from '@/db/database';
import { createTestDatabase } from '@/db/testing';
import { guardLogin } from '@/domain/shift';
import { GUARD, guardState, idSequence, local, ROUTE_A, SCHEDULE_A, SCHEDULES, TIMEZONE } from '@/domain/testing';
import type { ClockReading } from '@/time/clock';

import { loadAlarmScreenInfo } from './alarm';
import { loadGuardState } from './state';
import { seedSite } from './testing';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('@/sync/runtime', () => ({ notifyChainEntry: jest.fn(), requestSync: jest.fn() }));

const SLOT = { route_id: ROUTE_A, schedule_id: SCHEDULE_A, scheduled_at: local('20:00') };

let db: Database;
let now: string;
const readClock = (): ClockReading => ({ device_time: now, uptime_ms: 1000, boot_id: 'android-boot:12' });

async function startShift() {
  now = local('19:55');
  await appendChainEntries(db, guardLogin(loadGuardState(db, now)!, GUARD, now, idSequence()).drafts, { readClock });
  now = local('20:00');
}

beforeEach(async () => {
  ({ db } = await createTestDatabase());
});

it('names the route on a site with several routes', async () => {
  await seedSite(db);
  await startShift();
  expect(loadAlarmScreenInfo(db, SLOT, readClock)).toEqual({ round_id: null, checkpoints: 3, time_limit_min: 20, previous: null, timezone: TIMEZONE, route_name: 'Útvonal 61' });
});

it('does not name the only route', async () => {
  const state = guardState();
  await seedSite(db, { ...state, routes: state.routes.slice(0, 1), schedules: SCHEDULES.slice(0, 1), versions: state.versions.slice(0, 1) });
  await startShift();
  expect(loadAlarmScreenInfo(db, SLOT, readClock)?.route_name).toBeNull();
});

it('is null when the alarm has nothing to say, or the site is not pulled yet', async () => {
  now = local('20:00');
  expect(loadAlarmScreenInfo(db, SLOT, readClock)).toBeNull();
  await seedSite(db);
  expect(loadAlarmScreenInfo(db, SLOT, readClock)).toBeNull();
});
