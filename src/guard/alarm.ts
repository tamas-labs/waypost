// What the alarm screen (G4) shows: the domain's view of the alarm's round with the names from the database.
import type { Database } from '@/db/database';
import { roundAlarmInfo, type AlarmSlot, type RoundAlarmInfo } from '@/domain/alarms';
import { readClock as readDeviceClock, type ReadClock } from '@/time/clock';

import { routeNameAmongSeveral } from './names';
import { loadGuardStateNow } from './state';

export interface AlarmScreenInfo extends RoundAlarmInfo {
  timezone: string;
  /** Which route it is, if the site has several; null with one. */
  route_name: string | null;
}

/** Null: the alarm has nothing to say any more (roundAlarmInfo), or the site is not pulled yet. */
export function loadAlarmScreenInfo(db: Database, slot: AlarmSlot, readClock: ReadClock = readDeviceClock): AlarmScreenInfo | null {
  const { now, state } = loadGuardStateNow(db, readClock);
  const info = state === null ? null : roundAlarmInfo(state, slot, now);
  if (state === null || info === null) return null;
  return { ...info, timezone: state.timezone, route_name: routeNameAmongSeveral(db, state, slot.route_id) };
}
