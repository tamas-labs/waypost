// Test helper: a site with two routes and their schedules, as the domain rules see it. Only tests import it.
//
// Route A (fixed order, version A1: C1 → C2 → C3): schedule "A hourly", 20:00–23:00 every 60 min, 20-minute limit.
// Route B (free order, version B1: C3, C4): schedule "B list", 20:30 and 22:30, no time limit.
// Site time zone Europe/Budapest; the night of Tuesday 2026-11-03 (CET, UTC+1).
import type { Timestamp } from '@waypost/schema';

import { parseLocalDate, parseLocalTime, resolveLocal } from '@/time/zone';
import { toTimestamp } from '@/time/timestamp';

import type { ScheduleOfRoute } from './schedule';
import type { CheckpointInfo, GuardState, RoundInfo } from './state';

const uuid = (n: number) => `019a2b3c-4d5e-7f00-8a00-${String(n).padStart(12, '0')}`;

export const SITE = uuid(1);
export const GUARD = uuid(3);
export const OTHER_GUARD = uuid(13);
export const SHIFT = uuid(20);
export const C1 = uuid(51);
export const C2 = uuid(52);
export const C3 = uuid(53);
export const C4 = uuid(54);
export const ROUTE_A = uuid(61);
export const ROUTE_B = uuid(62);
export const VERSION_A1 = uuid(71);
export const VERSION_A2 = uuid(72);
export const VERSION_B1 = uuid(73);
export const SCHEDULE_A = uuid(81);
export const SCHEDULE_B = uuid(82);
export const TIMEZONE = 'Europe/Budapest';

/** UTC timestamp of a local time in Budapest, e.g. local('20:05') on 2026-11-03, local('00:20', '2026-11-04'). */
export function local(time: string, date = '2026-11-03'): Timestamp {
  return toTimestamp(resolveLocal(parseLocalDate(date) + parseLocalTime(time) * 60_000, TIMEZONE));
}

/** Deterministic IDs: 019a2b3c-4d5e-7f00-8a00-000000001000, …1001, … */
export function idSequence(start = 1000): () => string {
  let next = start;
  return () => uuid(next++);
}

const checkpoint = (id: string, n: number): CheckpointInfo => ({
  id,
  tag_uid: `04A1B2C3D4E5${String(n).padStart(2, '0')}`,
  qr_payload: `waypost:cp:${id}:aB3dE5gH7jK9mN${String(n).padStart(2, '0')}`,
  lat_e7: 474979000 + n * 1000,
  lng_e7: 190402000,
  active: true,
});

export const SCHEDULES: ScheduleOfRoute[] = [
  { id: SCHEDULE_A, route_id: ROUTE_A, weekdays: 127, mode: 'interval', start_times: null, interval_from: '20:00', interval_to: '23:00', interval_every_min: 60, time_limit_min: 20, active: true },
  { id: SCHEDULE_B, route_id: ROUTE_B, weekdays: 127, mode: 'list', start_times: ['20:30', '22:30'], interval_from: null, interval_to: null, interval_every_min: null, time_limit_min: null, active: true },
];

export function guardState(overrides: Partial<GuardState> = {}): GuardState {
  return {
    site_id: SITE,
    timezone: TIMEZONE,
    shift: null,
    routes: [
      { id: ROUTE_A, order_mode: 'fixed', current_version_id: VERSION_A1, active: true },
      { id: ROUTE_B, order_mode: 'free', current_version_id: VERSION_B1, active: true },
    ],
    schedules: SCHEDULES,
    versions: [
      { id: VERSION_A1, route_id: ROUTE_A, checkpoint_ids: [C1, C2, C3] },
      { id: VERSION_A2, route_id: ROUTE_A, checkpoint_ids: [C2, C4] },
      { id: VERSION_B1, route_id: ROUTE_B, checkpoint_ids: [C3, C4] },
    ],
    checkpoints: [checkpoint(C1, 1), checkpoint(C2, 2), checkpoint(C3, 3), checkpoint(C4, 4)],
    rounds: [],
    ...overrides,
  };
}

/** The shift of GUARD, started at 19:55. */
export const OPEN_SHIFT = { id: SHIFT, guard_id: GUARD, started_at: local('19:55') };

/** A round of route A or B at a local time, open unless the fields say otherwise. */
export function round(route: 'A' | 'B', time: string, fields: Partial<RoundInfo> = {}): RoundInfo {
  const a = route === 'A';
  return {
    id: uuid(a ? 900 + parseLocalTime(time) : 950 + parseLocalTime(time)),
    shift_id: SHIFT,
    route_id: a ? ROUTE_A : ROUTE_B,
    route_version_id: a ? VERSION_A1 : VERSION_B1,
    schedule_id: a ? SCHEDULE_A : SCHEDULE_B,
    scheduled_at: local(time),
    time_limit_min: a ? 20 : null,
    status: 'open',
    scans: [],
    ...fields,
  };
}
