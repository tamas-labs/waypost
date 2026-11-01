// What the screens around the login show: the PIN screen and the shift start.
import type { Timestamp } from '@waypost/schema';
import { eq } from 'drizzle-orm';

import type { Database } from '@/db/database';
import { routes, sites } from '@/db/schema';
import { nextRound, shiftDay, type NextRound, type ShiftDay, type ShiftDayRoute } from '@/domain/shift-view';
import { readClock as readDeviceClock, type ReadClock } from '@/time/clock';

import { userName } from './login';
import { loadGuardStateNow } from './state';

/** What the PIN screen shows above the keypad. */
export interface PinScreenInfo {
  site_name: string;
  timezone: string;
  /** Trusted time. */
  now: Timestamp;
  /** The name of the guard whose shift is open. */
  on_shift: string | null;
  next_round: NextRound | null;
}

/** The site of the phone and its shift at the trusted time; null while the site is not pulled yet (nobody can log in). */
export function loadPinScreenInfo(db: Database, readClock: ReadClock = readDeviceClock): PinScreenInfo | null {
  const { now, state } = loadGuardStateNow(db, readClock);
  if (state === null) return null;
  const site = db.select({ name: sites.name }).from(sites).where(eq(sites.id, state.site_id)).get();
  return {
    site_name: site?.name ?? '',
    timezone: state.timezone,
    now,
    on_shift: state.shift === null ? null : userName(db, state.shift.guard_id),
    next_round: nextRound(state, now),
  };
}

/** What the shift start screen (G2) shows of the shift's night. */
export interface ShiftStartInfo {
  timezone: string;
  /** The logged-in guard's name. */
  guard_name: string;
  /** Null if no route has rounds within a day. */
  day: (Omit<ShiftDay, 'routes'> & { routes: (ShiftDayRoute & { name: string })[] }) | null;
}

export function loadShiftStartInfo(db: Database, guardId: string, readClock: ReadClock = readDeviceClock): ShiftStartInfo | null {
  const { now, state } = loadGuardStateNow(db, readClock);
  if (state === null) return null;
  const day = shiftDay(state, now);
  const names = new Map(
    db
      .select({ id: routes.id, name: routes.name })
      .from(routes)
      .where(eq(routes.site_id, state.site_id))
      .all()
      .map((route) => [route.id, route.name]),
  );
  return {
    timezone: state.timezone,
    guard_name: userName(db, guardId) ?? '',
    day: day === null ? null : { ...day, routes: day.routes.map((route) => ({ ...route, name: names.get(route.route_id) ?? '' })) },
  };
}
