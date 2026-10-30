// What the alarm screen (G4) shows: the domain's view of the alarm's round with the names from the database.
import { eq } from 'drizzle-orm';

import type { Database } from '@/db/database';
import { routes } from '@/db/schema';
import { roundAlarmInfo, type AlarmSlot, type RoundAlarmInfo } from '@/domain/alarms';
import { readClock as readDeviceClock, type ReadClock } from '@/time/clock';
import { trustedTime } from '@/time/trusted-time';

import { loadGuardState } from './state';

export interface AlarmScreenInfo extends RoundAlarmInfo {
  timezone: string;
  /** Which route it is, if the site has several; null with one. */
  route_name: string | null;
}

/** Null: the alarm has nothing to say any more (roundAlarmInfo), or the site is not pulled yet. */
export function loadAlarmScreenInfo(db: Database, slot: AlarmSlot, readClock: ReadClock = readDeviceClock): AlarmScreenInfo | null {
  const now = trustedTime(db, readClock()).time;
  const state = loadGuardState(db, now);
  const info = state === null ? null : roundAlarmInfo(state, slot, now);
  if (state === null || info === null) return null;
  const several = state.routes.filter((route) => route.active && route.current_version_id !== null).length > 1;
  const route = several ? db.select({ name: routes.name }).from(routes).where(eq(routes.id, slot.route_id)).get() : undefined;
  return { ...info, timezone: state.timezone, route_name: route?.name ?? null };
}
