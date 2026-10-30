// What the alarm screen (G4) shows: the domain's view of the alarm's round with the names from the database.
import { eq } from 'drizzle-orm';

import type { Database } from '@/db/database';
import { routes } from '@/db/schema';
import { roundAlarmInfo, type AlarmSlot, type RoundAlarmInfo } from '@/domain/alarms';
import type { GuardState } from '@/domain/state';
import { readClock as readDeviceClock, type ReadClock } from '@/time/clock';
import { trustedTime } from '@/time/trusted-time';

import { loadGuardState } from './state';

export interface AlarmScreenInfo extends RoundAlarmInfo {
  timezone: string;
  /** Which route it is, if the site has several; null with one. */
  route_name: string | null;
}

/** The route's name on a site with several routes that have rounds; null with one, where it says nothing. */
export function routeNameAmongSeveral(db: Database, state: GuardState, routeId: string): string | null {
  const several = state.routes.filter((route) => route.active && route.current_version_id !== null).length > 1;
  if (!several) return null;
  return db.select({ name: routes.name }).from(routes).where(eq(routes.id, routeId)).get()?.name ?? null;
}

/** Null: the alarm has nothing to say any more (roundAlarmInfo), or the site is not pulled yet. */
export function loadAlarmScreenInfo(db: Database, slot: AlarmSlot, readClock: ReadClock = readDeviceClock): AlarmScreenInfo | null {
  const now = trustedTime(db, readClock()).time;
  const state = loadGuardState(db, now);
  const info = state === null ? null : roundAlarmInfo(state, slot, now);
  if (state === null || info === null) return null;
  return { ...info, timezone: state.timezone, route_name: routeNameAmongSeveral(db, state, slot.route_id) };
}
