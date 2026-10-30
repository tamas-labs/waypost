// What the shift home (G3) shows: the domain's view of the open shift with the names from the database.
import { eq } from 'drizzle-orm';

import type { Database } from '@/db/database';
import { checkpoints, routes, sites } from '@/db/schema';
import { shiftHome, type ShiftHome, type ShiftRound } from '@/domain/shift';
import { readClock as readDeviceClock, type ReadClock } from '@/time/clock';
import { parseTimestamp } from '@/time/timestamp';
import { trustedTime } from '@/time/trusted-time';

import { userName } from './login';
import { loadGuardState } from './state';

export type ShiftHomeRound = Omit<ShiftRound, 'missing_checkpoint_ids'> & { route_name: string; missing_names: string[] };

export interface ShiftHomeInfo {
  site_name: string;
  timezone: string;
  guard_name: string;
  /** Null: no shift is open any more (e.g. it closed automatically). */
  home: (Omit<ShiftHome, 'rounds'> & { rounds: ShiftHomeRound[] }) | null;
}

/** Null while the site is not pulled yet. */
export function loadShiftHomeInfo(db: Database, guardId: string, readClock: ReadClock = readDeviceClock): ShiftHomeInfo | null {
  const now = trustedTime(db, readClock()).time;
  const state = loadGuardState(db, now);
  if (state === null) return null;
  const site = db.select({ name: sites.name }).from(sites).where(eq(sites.id, state.site_id)).get();
  const home = shiftHome(state, now);
  const routeNames = new Map(db.select({ id: routes.id, name: routes.name }).from(routes).where(eq(routes.site_id, state.site_id)).all().map((route) => [route.id, route.name]));
  const checkpointNames = new Map(db.select({ id: checkpoints.id, name: checkpoints.name }).from(checkpoints).where(eq(checkpoints.site_id, state.site_id)).all().map((point) => [point.id, point.name]));
  return {
    site_name: site?.name ?? '',
    timezone: state.timezone,
    guard_name: userName(db, guardId) ?? '',
    home:
      home === null
        ? null
        : {
            ...home,
            rounds: home.rounds.map(({ missing_checkpoint_ids, ...round }) => ({
              ...round,
              route_name: routeNames.get(round.route_id) ?? '',
              missing_names: missing_checkpoint_ids.map((id) => checkpointNames.get(id) ?? ''),
            })),
          },
  };
}

/** The trusted time now, in Unix milliseconds: what the countdowns count to. */
export function trustedNowMs(db: Database, readClock: ReadClock = readDeviceClock): number {
  return parseTimestamp(trustedTime(db, readClock()).time);
}
